# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

> 只管编写模型，交互体验交给运行时。

Compute Experience Runtime 是一个开源库，用于将计算模型转化为可交互体验。开发者定义**计算什么**；运行时拥有 **Run**——持久、可导航的执行历史——并让人能够**进入计算本身**。

核心边界：

```text
Model ≠ Run ≠ Experience

Model
  ↓
Run
  ↓
State History + Trace
  ↓
Runtime
  ↓
Experience
```

- **Model** — 计算规则（`initial` / `step` / `derive`）、可选 `explain()`、清单元数据。
- **Run** — 特定参数与状态下的一次执行历史。
- **Experience** — 回放、检查、追溯、干预、重放。

计算不是一次性黑盒。Run 是可以被检查、跟随、触碰、重塑的对象。

本项目**不是** AI 平台，没有 LLM、账户或云端后端。

## 产品命题

传统软件：

```text
输入 → 计算 → 输出
```

本项目探索：

```text
计算世界 → 检查 → 追溯 → 干预 → 重放 → 观察后果
```

Playground 的第一个完整体验是 **Lorenz 计算显微镜**——轨迹本身就是界面。

```text
watch → hold → ask → follow → touch → release → replay
```

## 代码包结构

| 路径 | 职责 |
| --- | --- |
| `packages/core` | 模型协议、Run、检查/干预、fork/compare、快照 |
| `packages/renderers` | 轨迹、摆、时间序列渲染器 |
| `packages/ui` | manifest UI、计算显微镜、反事实面板 |
| `playground/` | 浏览器演示 |
| `examples/` | 内置模型 |
| `bridge/` | Python 离线 NDJSON 协议 |

## 快速开始

```bash
npm install
npm run dev
npm test
npm run build
```

## Lorenz 计算显微镜

Playground 默认打开 **Lorenz attractor**，世界优先模式：

1. **Watch** — 全屏轨迹自动运行
2. **Hold** — 点击轨迹或暂停，当前点成为仪器光标
3. **Ask** — 点击轨迹点或 x/y/z 读数，就地显示 authored 计算
4. **Follow** — 点击项（`x·y`、`x`…）深入；状态引用跳到轨迹上的时间祖先
5. **Touch** — 跟到具体状态值后可编辑
6. **Release** — 提交干预；过去静止，未来从 seam 重算并向前生长
7. **Return / restore** — 退出检查或恢复干预前世界

Lorenz **没有**默认的双轨 ORIGINAL/COUNTERFACTUAL 对比。干预在同一条可见世界上原地重塑。

```typescript
runtime.inspect(420, "z");
runtime.inspect(419, "x", null, { push: true, seek: true });
runtime.intervene({ frameIndex: 419, field: "x", value: 8.5 });
runtime.play();
```

### Authored trace

Lorenz 的 `explain()` 返回结构化 `ComputationTrace`——作者编写的执行结构，不是自动因果推断或 LLM 解释。

帧语义：帧 N−1 的输入状态 → `step()` → 帧 N 的结果状态。

## 创建运行时

```typescript
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI } from "@compute-experience/ui";

const runtime = createRuntime({
  model: myModel,
  rendererRegistry: createRendererRegistry(),
  parameters: defaultParameters(myModel),
});

mountExperienceUI({ runtime, microscopeMode: true, elements: { /* ... */ } });
```

### 公共 API

- **播放：** `play()`, `pause()`, `seek()`, `seekIndex()`, `step()`
- **Run：** `forkAt()`, `compare()`, `clearBranches()`, …
- **检查：** `trace()`, `inspect()`, `inspectionBack()`, `clearInspection()`
- **干预：** `intervene()`, `reshapeAt()`（Run 层）
- **快照：** `snapshot()`, `restore()`

## Fork 与对比（次要能力）

Fork 仍可用于探索替代未来，尤其在 SIR 等决策系统上。

```typescript
const branch = runtime.forkAtTime(5.2);
branch.setForkState({ ... });
runtime.setSyncPlayback(true);
```

对 Lorenz，用户看到的是 `touch → 未来重塑`，而非默认双曲线对比。

### SIR 反事实演示

选择 **SIR Counterfactual**：历史 → 分叉 → 干预时机 → 替代未来 → 对比。

## 内置模型

| 模型 | Playground 体验 |
| --- | --- |
| Lorenz attractor | **计算显微镜**（默认） |
| SIR Counterfactual | Fork / 对比 |
| Rössler / Pendulum / Logistic | 标准 manifest UI |

## 里程碑

- 运行时与 Run 架构
- Manifest 驱动 UI
- **Lorenz 计算显微镜**：世界优先的检查 → 追溯 → 触碰 → 原地重放
- SIR 反事实演示
- Authored trace（`explain()`）

## 非目标

- AI / LLM
- 自动因果推断、符号引擎、源码追踪
- 账户、云端、WebGPU 重写
- Python 实时桥接（未来工作）

更多 API 与架构细节见 [英文 README](README.md)。
