import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionToolContext,
	ToolLoadout,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createPiCodeModeBridge } from "../src/adapter/code-mode/pi-tools.ts";
import { CodeModeDelegateRuntime } from "../src/tools/code-mode/delegate-runtime.ts";
import { PiToolCallScope } from "../src/tools/code-mode/pi-tool-call-scope.ts";
import { toCodeModeToolResult } from "../src/tools/code-mode/tool-result.ts";

test("Pi bridge forwards terminating nested tool results to the outer Code Mode result", async () => {
	const piTool = {
		name: "handoff",
		description: "Finish the current turn",
		parameters: Type.Object({}, { additionalProperties: false }),
	};
	const bridge = createPiCodeModeBridge({
		getAllTools: () => [],
	} as unknown as ExtensionAPI);
	bridge.prepareLoadout({
		declared: [piTool],
		callable: [piTool],
		registered: [piTool],
		getExposure: () => "direct",
		getNamespace: () => undefined,
		getPromptGuidelines: () => [],
	} as unknown as ToolLoadout);
	const bridgedTool = bridge.getTools()[0];
	assert.ok(bridgedTool);

	const nestedResult = {
		content: [{ type: "text" as const, text: "standby" }],
		details: {},
		terminate: true,
	};
	const piToolScope = new PiToolCallScope({
		executeTool: async () => ({
			toolCall: { id: "nested", name: "handoff", arguments: {} },
			result: nestedResult,
			isError: false,
		}),
	} as unknown as ExtensionToolContext);
	const runtime = new CodeModeDelegateRuntime(() => {});
	runtime.bindCell(
		"cell",
		{ cwd: "/", piToolScope },
		new Map([[bridgedTool.name, bridgedTool]]),
	);

	try {
		assert.equal(
			await runtime.invokeDirect("cell", 1, bridgedTool.name, {}),
			"standby",
		);
		const result = toCodeModeToolResult(runtime.attach({
			kind: "result",
			cellId: "cell",
			contentItems: [],
		}));
		assert.equal(result.terminate, true);
	} finally {
		await piToolScope.close();
		runtime.clear();
	}
});
