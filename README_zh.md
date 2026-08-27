# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

> 只管编写模型，交互体验交给运行时。
> (Write the model. Let the runtime handle the experience.)

Compute Experience Runtime 是一个开源库，用于将计算模型转化为可交互的数字化体验。开发者只需定义“**计算什么**”（what to compute）；运行时负责处理回放、状态、参数、时间线、快照以及渲染器选择。

核心边界：

```text
Model ≠ Experience (模型 ≠ 体验)

Model (模型)  →  State (状态)  →  Runtime (运行时)  →  Experience (体验)
```

本项目**不是** AI 平台。本仓库中没有 LLM 集成、身份验证、云端后端或账户系统。

## 代码包结构 (Packages)

| 路径 | 职责 |
| --- | --- |
| `packages/core` | `@compute-experience/core` — 模型协议、时间线、播放控制器、快照及 `createRuntime()` |
| `packages/renderers` | `@compute-experience/renderers` — 轨迹 (trajectory)、摆动 (pendulum) 和时间序列 (timeseries) 渲染器 + 渲染器注册表 |
| `packages/ui` | `@compute-experience/ui` — 基于清单 (manifest) 驱动的参数、指标和播放控制面板 |
| `playground/` | **消费/调用**运行时的浏览器端演示 Playground（并非运行时本身） |
| `examples/` | 使用 `defineModel()` 定义的模型示例 |
| `bridge/` + `examples/` 下的 Python | 用于离线导出 NDJSON 的创作协议（并非实时浏览器后端） |

## 快速开始

```bash
npm install
npm run dev      # 启动 playground（通常在 http://localhost:5173）
npm test         # 运行单元测试
npm run build    # 类型检查 + 生产打包
```

Python 协议测试：

```bash
python -m pytest -q
```

## 定义模型 (Define a model)

模型是一个包含 `manifest`、`initial`、`step` 以及可选的 `derive` 的普通 JavaScript/TypeScript 对象：

```typescript
import { defineModel } from "@compute-experience/core";

export const myModel = defineModel({
  manifest: {
    id: "my-model",
    name: "My Model",
    description: "A minimal example.",
    version: "0.1.0",
    renderer: "timeseries-2d",
    parameters: [
      { id: "rate", label: "Rate", type: "number", default: 1, min: 0, max: 5, step: 0.1 },
    ],
    state: ["x"],
    derived: ["absX"],
  },
  time: { steps: 200, dt: 0.05, playbackRate: 1, unit: "s" },
  initial() {
    return { x: 1 };
  },
  step(state, parameters, dt) {
    return { x: state.x + Number(parameters.rate) * dt };
  },
  derive(state) {
    return { absX: Math.abs(state.x) };
  },
});
```

清单（manifest）用于自动驱动 Playground 中的参数控件。无需为每个模型单独硬编码滑块等 UI。

## 创建运行时 (Create a runtime)

```typescript
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI } from "@compute-experience/ui";

const runtime = createRuntime({
  model: myModel,
  rendererRegistry: createRendererRegistry(),
  parameters: defaultParameters(myModel),
});

mountExperienceUI({
  runtime,
  elements: {
    params: document.getElementById("params")!,
    metrics: document.getElementById("metrics")!,
    viewport: document.getElementById("viewport")!,
    play: document.getElementById("play") as HTMLButtonElement,
    scrub: document.getElementById("scrub") as HTMLInputElement,
    time: document.getElementById("time")!,
  },
});
```

公共 API（稳定公开接口）：

- **播放控制 (Playback):** `play()`, `pause()`, `toggle()`, `seek(time)`, `seekIndex(index)`, `step(delta)`
- **状态管理 (State):** `rebuild()`, `setParameters(patch)`, `setInitialState(state)`, `currentFrame()`, `currentIndex()`
- **快照管理 (Snapshots):** `snapshot(includeFrames?)`, `restore(snapshot)`
- **事件订阅 (Events):** `subscribe(listener)` → 取消订阅函数 (unsubscribe function)
- **渲染挂载 (Rendering):** `mount({ viewport, overlay? })`, `unmount()`, `resize()`

## 渲染器 (Renderers)

渲染器通过 ID 注册。模型的清单中声明其使用的渲染器：

```typescript
renderer: "trajectory-3d"   // 洛伦兹 (Lorenz)、罗斯勒 (Rössler)
renderer: "pendulum-2d"     // 非线性单摆 (nonlinear pendulum)
renderer: "timeseries-2d"  // SIR 传染病模型 (SIR epidemic)
```

运行时通过注册表动态解析渲染器。Core 核心包不会直接引入具体的渲染器实现。

## 快照 (Snapshots)

快照是确定性的、兼容 JSON 的纯数据对象：

```json
{
  "model": "lorenz-attractor",
  "version": "0.1.0",
  "params": { "sigma": 10, "rho": 28, "beta": 2.67 },
  "cursor": 42,
  "savedAt": "2026-08-27T12:00:00.000Z",
  "frames": []
}
```

`frames` 为可选字段。可以使用 `serializeSnapshot()` / `deserializeSnapshot()` 进行快照的序列化导出与反序列化导入。

## 内置模型 (Built-in models)

| 模型 | 渲染器 |
| --- | --- |
| 洛伦兹吸引子 (Lorenz attractor) | `trajectory-3d` |
| 罗斯勒吸引子 (Rössler attractor) | `trajectory-3d` |
| 简摆 (Simple pendulum) | `pendulum-2d` |
| SIR 传染病模型 (SIR epidemic) | `timeseries-2d` |
| Logistic 增长模型 (Logistic growth, `custom-model`) | `timeseries-2d` |

在 Playground 中切换不同模型时均复用相同的运行时抽象 —— 无需编写任何特定于模型的 UI 代码。

## 创建第三方模型 (Create a third-party model)

请参阅 [`examples/custom-model/`](examples/custom-model/)。创作文件仅需定义模型本身。Playground 会将其注册到模型目录中，并复用相同的 `createRuntime()` + `mountExperienceUI()` 流程 —— 无需编写新的 UI。

```bash
# 仅需定义模型
examples/custom-model/model.ts

# 体验如何呈现（运行时已提供通用能力）
createRuntime({ model: customModel, rendererRegistry })
mountExperienceUI({ runtime, elements })
```

## 架构概览 (Architecture)

```text
Third-party Model (第三方模型)
       │
       ▼
Model Protocol (manifest + initial/step/derive) (模型协议)
       │
       ▼
Compute Experience Runtime (计算体验运行时)
   ┌───┼───┐
   │   │   │
   ▼   ▼   ▼
State Player Snapshot (状态 / 播放器 / 快照)
       │
       ▼
Renderer Registry (渲染器注册表)
       │
       ▼
  Experience (交互体验)
```

## Python 创作协议 (Python authoring protocol)

`examples/` 目录下的 Python 模型遵循相同的契约以进行离线仿真：

```python
MANIFEST = {...}

def initial(parameters): ...
def step(state, parameters, dt): ...
def derive(state, parameters): ...  # 可选
```

导出为 NDJSON：

```bash
python bridge/author.py examples/rossler_model.py \
  --parameters '{"a":0.2,"b":0.2,"c":5.7}' \
  --steps 520 --dt 0.03
```

模式定义 (Schema)：`packages/core/src/protocol/manifest-schema.json`（在 `runtime/authoring.schema.json` 亦有镜像）。

## 路线图 (Roadmap - 当前重点)

- **Phase 1（已完成）:** 从 Playground 应用中抽离 runtime 核心库
- **Phase 2（已完成）:** 通过 `@compute-experience/ui` 实现基于清单驱动的 UI
- **Phase 3（已完成）:** `examples/custom-model` —— 第三方开发者仅编写模型，无需编写 UI

## 明确的非目标 (Deliberate non-goals)

- AI / 大语言模型 (LLM) 代码生成
- 身份验证、账户系统、数据库、云端托管部署
- WebGPU 迁移、高级 3D 编辑器、任意代码执行环境
- Python 实时计算桥接（WASM / 热重载）—— 属于未来规划
