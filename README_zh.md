# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

> 只管编写模型，交互体验交给运行时。
> (Write the model. Let the runtime handle the experience.)

Compute Experience Runtime 是一个开源库，用于将计算模型转化为可交互的数字化体验。开发者只需定义“**计算什么**”；运行时拥有 **Run**（运行）——持久、可导航、可分叉的执行历史——并将其转化为生动的交互体验。

核心边界：

```text
Model ≠ Run ≠ Experience (模型 ≠ 运行 ≠ 体验)

Model (模型)
  ↓
Run (运行实例)
  ↓
State History (状态历史)
  ↓
Fork / Intervene / Compare (分叉 / 干预 / 对比)
  ↓
Experience (交互体验)
```

- **Model（模型）** — 计算规则（`initial` / `step` / `derive`）与清单元数据。
- **Run（运行）** — 在特定参数与初始状态下的一次具体执行历史。
- **Experience（体验）** — 对一个或多个 Run 的回放、检视与对比体验。

计算不再是一次性的即抛型函数调用，Run 成为了持久、可导航、可分叉的第一类对象。

本项目**不是** AI 平台。本仓库中没有 LLM 集成、身份验证、云端后端或账户系统。

## 代码包结构 (Packages)

| 路径 | 职责 |
| --- | --- |
| `packages/core` | `@compute-experience/core` — 模型协议、Run、时间线、播放控制器、分叉/对比 (fork/compare)、快照及 `createRuntime()` |
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

## 定义模型 (Define a model)

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
  },
  time: { steps: 200, dt: 0.05, playbackRate: 1, unit: "s" },
  initial() {
    return { x: 1 };
  },
  step(state, parameters, dt) {
    return { x: state.x + Number(parameters.rate) * dt };
  },
});
```

## 创建运行时与分叉运行 (Create a runtime and fork a run)

```typescript
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI } from "@compute-experience/ui";

const runtime = createRuntime({
  model: myModel,
  rendererRegistry: createRendererRegistry(),
  parameters: defaultParameters(myModel),
});

runtime.rebuild();
runtime.seek(4.7);

// 在时间 4.7 处分叉出一个新的分支 Run
const runB = runtime.forkAtTime(4.7);
runB.setParameters({ rate: 1.4 });
// 或者在分叉点直接干预状态：
// runB.setForkState({ x: runB.currentFrame()!.state.x + 0.1 });

runtime.setSyncPlayback(true);
runtime.play(); // 主运行与分叉分支同步向前推进

const diff = runtime.compare();
console.log(diff?.divergenceIndex, diff?.stateDifferences);

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
- **Run 管理 (Runs):** `primaryRun`, `runs`, `comparisonRuns`, `forkAt(index)`, `forkAtTime(time)`, `clearBranches()`, `compare()`, `setSyncPlayback(enabled)`
- **状态管理 (State):** `rebuild()`, `setParameters(patch)`, `setInitialState(state)`, `currentFrame()`, `currentIndex()`
- **快照管理 (Snapshots):** `snapshot(includeFrames?)`, `restore(snapshot)` — 存在分支时同时包含多分叉运行数据
- **事件订阅 (Events):** `subscribe(listener)` — 支持 `frame`, `rebuild`, `parameters`, `run-created`, `run-forked`, `run-updated`, `run-seek`, `run-state-changed`
- **渲染挂载 (Rendering):** `mount({ viewport, overlay? })`, `unmount()`, `resize()`

## 计算检查器（实验性）(Computational inspector)

Lorenz 是首个实现可选 `explain()` 钩子的模型。Playground 提供 **检查 → 追溯 → 干预 → 重放** 流程：

```text
选择数值 → 查看作者编写的计算结构 → 点击祖先项 → 深入 → 编辑 → 重放 → 未来轨迹重塑
```

这是**作者显式提供的执行结构**，不是自动因果推断。

```typescript
runtime.trace(420, "z");
runtime.inspect(420, "z");
runtime.intervene({ frameIndex: 419, field: "x", value: 8.5 });
```

## 洛伦兹吸引子分叉演示 (Lorenz fork showcase)

在 Playground 中打开 **Lorenz attractor（洛伦兹吸引子）**：

1. 点击播放，在感兴趣的时间点暂停。
2. 点击 **Fork** 按钮（或按快捷键 `F`）—— 创建一条新分支并微调状态。
3. 点击播放 —— 两个 Run 分支将同步向前演进。
4. 两条轨迹在 3D 视图中同时渲染，并带有显示发散距离的动态连线；指标面板实时展示 `Δ` 差值。

点击 **Clear branch** 可恢复为单分支运行。

## SIR 反事实演示 (SIR counterfactual showcase)

在 Playground 中选择 **SIR Counterfactual**：

```text
历史 → 分叉 → 干预时机 → 替代未来 → 对比
```

场景：原始运行中接触率干预从 **第 20 天** 开始。在第 15–20 天附近暂停并 **Fork**，仅在分支上将干预开始日改为 **第 10 天**。两条运行共享分叉点之前的同一疫情历史；只有未来轨迹会分离。

> 重点不是把疫情画得更漂亮，而是让替代历史成为一等对象。

```typescript
runtime.pause();
runtime.seekIndex(day15Index);
runtime.forkAt(day15Index);
runtime.comparisonRuns[0]!.setParameters({ interventionStartDay: 10 });
runtime.setSyncPlayback(true);
runtime.play();
```

分支激活时，侧栏会显示峰值感染人数、峰值日期等结果对比。

## 渲染器 (Renderers)

```typescript
renderer: "trajectory-3d"   // 洛伦兹 (Lorenz)、罗斯勒 (Rössler)（支持多分叉对比渲染）
renderer: "pendulum-2d"     // 非线性单摆 (nonlinear pendulum)
renderer: "timeseries-2d"  // SIR 反事实 / Logistic 增长（SIR 支持多分叉对比）
```

单分支渲染器继续正常工作；具备对比能力的渲染器可直接读取 `view.primaryRun` 与 `view.comparisonRuns`。

## 快照 (Snapshots)

```json
{
  "model": "lorenz-attractor",
  "params": { "sigma": 10, "rho": 28, "beta": 2.67 },
  "cursor": 42,
  "savedAt": "...",
  "frames": [],
  "primaryRunId": "run_1_...",
  "syncPlayback": true,
  "runs": [
    { "id": "run_1_...", "params": {}, "cursor": 42, "frames": [] },
    { "id": "run_2_...", "parentRunId": "run_1_...", "forkIndex": 42, "params": {}, "cursor": 42, "frames": [] }
  ]
}
```

## 内置模型 (Built-in models)

| 模型 | 渲染器 |
| --- | --- |
| 洛伦兹吸引子 (Lorenz attractor) | `trajectory-3d` |
| 罗斯勒吸引子 (Rössler attractor) | `trajectory-3d` |
| 简摆 (Simple pendulum) | `pendulum-2d` |
| SIR 反事实 (SIR Counterfactual) | `timeseries-2d` |
| Logistic 增长模型 (Logistic growth, `custom-model`) | `timeseries-2d` |

## 创建第三方模型 (Create a third-party model)

请参阅 [`examples/custom-model/`](examples/custom-model/)。开发者仅需编写模型本身；运行时负责提供 Run 实例、回放控制、分叉机制及 UI 交互面板。

## 架构概览 (Architecture)

```text
Third-party Model (第三方模型)
       │
       ▼
Model Protocol (模型协议)
       │
       ▼
Computational Run(s) (计算运行实例)
   ┌───┼───┐
   │   │   │
   ▼   ▼   ▼
State Player Snapshot (状态 / 播放器 / 快照)
       │
  Fork / Compare (分叉 / 对比)
       │
       ▼
Renderer Registry (渲染器注册表)
       │
       ▼
  Experience (交互体验)
```

## Python 创作协议 (Python authoring protocol)

```bash
python bridge/author.py examples/rossler_model.py \
  --parameters '{"a":0.2,"b":0.2,"c":5.7}' \
  --steps 520 --dt 0.03
```

模式定义 (Schema)：[`packages/core/src/protocol/manifest-schema.json`](packages/core/src/protocol/manifest-schema.json)。

## 里程碑进展 (Milestone status)

- **运行时核心基石 (Runtime foundation):** 模型协议、Playground 宿主实现
- **清单驱动 UI (Manifest-driven UI):** `@compute-experience/ui`
- **第三方自定义模型 (Third-party custom-model):** 纯模型免 UI 开发验证
- **计算运行实例 v0.2 (Computational Runs):** Run、分叉 (fork)、对比 (compare)、同步回放、Lorenz 分叉发散演示
- **SIR 反事实演示 (SIR counterfactual):** 干预时机分叉/对比，验证非混沌决策系统
- **计算检查器 (Computational inspector):** Lorenz 追溯、递归检查、原地重放

## 明确的非目标 (Deliberate non-goals)

- AI / 大语言模型 (LLM) 代码生成
- 身份验证、账户系统、数据库、云端托管部署
- WebGPU 迁移、高级 3D 编辑器、任意代码执行环境
- Python 实时计算桥接（WASM / 热重载）—— 属于未来规划
