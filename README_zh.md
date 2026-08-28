# Compute Experience Runtime (计算体验微内核与反事实介质)

[English](README.md) | [简体中文](README_zh.md)

<p align="center">
  <strong>面向 AI 与科学计算的开源反事实计算介质与防伪微内核。</strong><br>
  <em>编写模型规则，由运行时接管持久化、可漫游、可分叉的时空计算体验。</em>
</p>

<p align="center">
  <a href="https://github.com/xylt369/compute-experience-runtime/actions"><img src="https://img.shields.io/badge/tests-130%20passed-34c759.svg" alt="Tests" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/typescript-strict-007acc.svg" alt="TypeScript" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/bundle-~60KB-ff9500.svg" alt="Vite Bundle" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
</p>

---

## 💡 核心哲学（The Core Philosophy）

传统软件将计算视为一次性的黑盒函数调用：

$$\text{输入} \longrightarrow \boxed{\text{黑盒代码计算}} \longrightarrow \text{输出}$$

**Compute Experience Runtime** 将每一次运行（Run）视为一个持久存在、可漫游、可分叉的平行时空：

$$\text{Model (模型规则)} \xrightarrow{\quad} \text{Run (写时复制时空历史)} \xrightarrow{\quad} \text{Experience (观察 · 溯源 · 分叉干预 · 重演)}$$

```text
       Model ≠ Run ≠ Experience

Model (模型)       ──► 纯数学动力学规则 (initial / step / derive / 闭合原语)
Run (运行实例)     ──► 基于写时复制 (CoW) 内存分页的高性能确定性历史状态流
Experience (体验)  ──► 交互计算介质：暂停、因果溯源、打点分叉平行未来、触摸并干预状态
```

---

## ⚡ 30 秒快速上手（30-Second Quickstarts）

### 1. Web 网页与任意前端项目（1 行代码嵌入）

```html
<div id="simulation" style="width: 100%; height: 400px;"></div>

<script type="module">
  import { mountExperience } from "@compute-experience/ui";
  import { lorenz } from "./examples/lorenz";

  // 一行代码挂载完整的交互计算画布
  const exp = mountExperience("#simulation", {
    model: lorenz,
    counterfactual: true,
    autostart: true,
  });

  // 在 t = 5.0 秒处分叉平行未来，施加 10⁻⁸ 的微小蝴蝶效应扰动
  exp.fork(5.0, { field: "x", delta: 1e-8 });
</script>
```

### 2. POSIX 命令行工具链（`cx` CLI）

```bash
# 无头运行仿真并将状态帧流式输出到 UNIX 管道
npx cx run lorenz-attractor --format ndjson | jq .state

# 在时间线上分叉并精确计算 IEEE-754 位级浮点发散度与发散时刻
npx cx diff lorenz-attractor --at 5.0 --intervene x=1e-8

# 静态校验组合模型的因果拓扑无环性与原语闭集合法性
npx cx inspect sir-epidemic
```

### 3. Python / Jupyter Notebook / Google Colab 交互式嵌入

```python
import compute_experience as cx

# 执行仿真并在 Jupyter 笔记本内直接渲染零依赖交互式控件
run = cx.simulate("lorenz-attractor", steps=600, dt=0.01)
cx.show(run) # 在 Notebook 单元格内输出可拖拽、可分叉的完整播放控件
```

---

## 🏛️ 动力系统博物馆（The Museum of Dynamic Systems）

Playground 内置 6 大经典动力学系统与 1 键沉浸式故事向导：

| 模型 | 系统类型 | 状态变量 | 探索的物理/科学现象 |
| --- | --- | --- | --- |
| 🦋 **Lorenz 吸引子** | 3D 混沌动力学 | $x, y, z$ | 奇异吸引子、蝴蝶效应与指数级轨迹发散 |
| 🏥 **SIR 传染病模型** | 房室微分方程 | $S, I, R$ | 疫情指数爆发峰值与紧急隔离政策压制（拉平曲线） |
| ⏱️ **简谐/非线性单摆** | 非线性力学 | $\theta, \omega$ | 大角度越顶翻转与幽灵双摆同屏对比 |
| 🌀 **Rössler 吸引子** | 连续超混沌 | $x, y, z$ | 单一二次非线性项下的连续螺旋混沌带 |
| 🦊 **Lotka-Volterra** | 生态种群方程 | $\text{prey}, \text{predator}$ | 捕食者-猎物生态循环震荡与第一积分能量守恒线 |
| ⚡ **Van der Pol 振荡器** | 非线性阻尼电路 | $x, y$ | 弛豫振荡、负阻效应与自激闭合极限环收敛 |

---

## 🔬 计算显微镜（The Computational Microscope）

在 Playground 中，轨迹本身即是交互界面：

```text
watch (观察) ──► hold (定格) ──► ask (提问) ──► follow (溯源) ──► touch (干预) ──► release (释放重演)
```

1. **Watch（观察）**：动力系统在全沉浸坐标系中连续演化。
2. **Hold（定格）**：点击轨迹或时间轴任意刻度，锁定精确时间帧。
3. **Ask（提问）**：点击任意状态读数（如 $x, y, z$），即时展开其底层数学公式与各项瞬时通量（Flux）。
4. **Follow（溯源）**：顺着因果项回溯，直接跳转到影响当前数值的上一级时空祖先。
5. **Touch & Intervene（干预）**：在定格点直接微调状态或参数。
6. **Release & Replay（重演）**：历史过去保持不可篡改，平行未来从接缝处实时重新演算并发散。

---

## 🛠️ Linux 系统级微内核与写时复制内存架构

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 COMPUTE EXPERIENCE RUNTIME: LINUX-GRADE CORE                │
│                                                                             │
│  [ Memory Subsystem ] ──► Chunked Float64 CoW Pages (refcount 零分配分叉)   │
│  [ POSIX CLI Tool ]   ──► `cx run`, `cx fork`, `cx diff`, `cx inspect`      │
│  [ Closed Primitives] ──► 9 大闭合动力学原语 (饱和增长 / 非线性恢复力 / 模长)│
│  [ 4-Tier Verification]─► 21 个测试套件 (130 JS 单元测试 + 5 Python 100% 绿灯)│
└─────────────────────────────────────────────────────────────────────────────┘
```

- **分块 Float64 内存页（Page Table）**：时空轨迹按固定步长（默认 64 步/页）分块存储。
- **$O(1)$ 零拷贝分叉**：分叉时仅递增历史页面的引用计数（`refCount++`），不分配冗余内存。
- **写时复制隔离（CoW）**：仅当分支计算推进并跨越分叉边界产生修改时，才按需克隆变动页面。

---

## 📦 Monorepo 模块分布

| 路径 | 子包 / 模块 | 核心职责 |
| --- | --- | --- |
| `packages/core` | `@compute-experience/core` | 微内核、CoW 分页表、Run 生命周期、9 大原语库、8-Pass 校验器、快照序列化 |
| `packages/renderers` | `@compute-experience/renderers` | 多分支物理渲染器（`Trajectory3D`、`Pendulum2D` 幽灵双摆、`Timeseries2D`） |
| `packages/ui` | `@compute-experience/ui` | 通用嵌入 API（`mountExperience`）、计算显微镜、极简 HUD、反事实面板 |
| `bin/cx.ts` | `cx` CLI | POSIX 标准命令行套件，支持无头执行、发散对比与 UNIX 管道流 |
| `examples/` | 内置动力系统模型 | Lorenz, SIR, Pendulum, Rössler, Lotka-Volterra, Van der Pol |
| `playground/` | 浏览器探索实验室 | Apple 暖白质感设计（`#faf9f5`）、博物馆向导、自然语言概念编译器 |

---

## 🧪 测试与质量验证

```bash
# 运行 21 个测试套件，130+ 项单元测试
npm test

# 运行 Python 跨语言协议一致性测试
python -m pytest -q

# 极速生产打包
npm run build

# 启动本地 Playground
npm run dev
```

---

## 📄 开源许可证

MIT © [xylt369](https://github.com/xylt369)
