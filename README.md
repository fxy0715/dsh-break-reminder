# dsh-break-reminder

<img src="./icon.svg" width="64" alt="休息提醒图标">

一个简单的 DeepSeek Harness（DSH）Windows 桌面休息提醒插件。忙了一阵，温和地提醒你起来走走、伸展一下，或者接杯水。

## 功能

- 默认每 **50 分钟**显示一张桌面右下角卡片，提醒间隔可配置。
- 静音、不抢焦点；点击“知道了”关闭，或等待约 **10 秒**自动收起。
- 三条中文文案随机轮换，避免连续重复。
- 输入框下方只读显示“约 X 分钟后休息”，悬停可查看完整运行状态；与时钟并排，窄窗口自然换行。
- 计时排除电脑睡眠和休眠时间，唤醒后继续剩余间隔，不补发积压提醒。
- 跟随 DSH 插件启动和退出，同一 Windows 会话只运行一个提醒实例。

不检测久坐或键鼠活动，不记录办公行为，不调用模型或外部网络服务，也不需要 API Key。界面状态通信复用现有 DSH 连接。当前不包含休息倒计时、延后提醒、声音、统计或鲸鱼联动。

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 包名 | `@local/dsh-break-reminder` |
| 版本 | `0.2.0` |
| 平台 | Windows 交互式桌面 |
| 实现 | JavaScript Host + Windows PowerShell 5.1 / WPF / C# |
| 显示位置 | Host 所在电脑的主显示器右下角工作区 |
| 依赖 | Windows 自带的 PowerShell、.NET Framework/WPF；无额外 npm 依赖 |

## 安装

在工程根目录用 **PowerShell** 执行，前提是已安装 Harness CLI：

```powershell
git clone https://github.com/fxy0715/dsh-break-reminder.git
cd dsh-break-reminder
npm run check
$pluginPath = (Get-Location).Path
dsh plugin --profile web add "$pluginPath"
dsh web
```

先停止目标 profile 的旧进程，再安装和重新启动。源码运行的 Harness 可在其仓库中使用 `pnpm dsh` 替代 `dsh`，并传入插件目录的绝对路径。使用其他 profile 时替换 `web`。

首次启动会等待完整的提醒间隔，不会立即弹出卡片。退出 DSH 后提醒停止；浏览器连接远程 Host 时，卡片显示在 Host 的 Windows 桌面，而不是浏览器所在电脑。插件未发布到 npm，请从本地目录安装。

## 调整提醒间隔

`cordis.patch.yml` 中只提供一个配置项：

```yaml
- insert:
    - id: dsh-break-reminder
      name: '@local/dsh-break-reminder'
      config:
        intervalMinutes: 50
```

`intervalMinutes` 为 **1～1440 的整数**。修改为所需分钟数后，重新安装本地目录并重启对应 profile，使配置生效。重启或重新加载插件后会开始新的计时周期。

点击“知道了”与自动收起都只关闭当前卡片，下次仍按正常间隔提醒。Windows 锁屏期间仍会计时；睡眠和休眠不计时。本插件不判断是否真的起身或喝水。

## 提醒示例

到达提醒时间时，桌面右下角会显示下面这样的卡片：

![休息提醒卡片示例](./docs/reminder-example.png)

示例文案：“忙了一阵了，起来走走、接杯水吧。”文案会随机轮换；卡片静音、不抢焦点，点击“知道了”或等待约 10 秒即可收起。输入框下方仅展示运行状态和剩余时间，没有点击操作。

## 开发与验证

不需要构建或安装 npm 依赖，修改文件后可直接验证：

```powershell
npm run check
```

`npm run check` 检查 Host 和 Client 的 JavaScript 语法。可在 Windows PowerShell 中单独核验 C# 编译：

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Add-Type -Path .\ReminderClock.cs"
```

`-ExecutionPolicy Bypass` 仅作用于该检查进程，不修改系统永久执行策略。实际启动时会加载 PowerShell 脚本、编译 C# 并创建 WPF 窗口。维护工作区的自动化测试脚本保留在本地，不随仓库发布。

| 文件 | 用途 |
| --- | --- |
| `index.js` | 配置校验、启动隐藏子进程、日志与卸载清理 |
| `client.js` | 输入框下方只读的运行状态与剩余时间 |
| `reminder.ps1` | 提醒文案、定时调度、父进程检测、单实例保护 |
| `ReminderClock.cs` | 排除睡眠的 Windows 时钟与提醒周期计算 |
| `reminder.xaml` | 提醒卡片布局、颜色和按钮样式 |
| `cordis.patch.yml` | Harness Bundle 配置 |
| `locale/` | 插件元信息的中英文文案；提醒卡片目前为中文 |

计时使用 Windows 的 [QueryUnbiasedInterruptTime](https://learn.microsoft.com/en-us/windows/win32/api/realtimeapiset/nf-realtimeapiset-queryunbiasedinterrupttime)，不受系统日期调整影响。每次仅显示一条提醒，不追补错过的周期。除了窗口本身，插件不保存用户数据。

界面每 5 秒通过 DSH 的认证 Connection RPC 通道读取后台实际状态，不会另起一个浏览器计时器估算提醒时间。后台未就绪、退出或连接失败时会显示对应状态，并自动继续读取。纯 Headless 环境不显示输入框状态条。

## 常见问题

**没有看到提醒？** 确认 Host 运行于 Windows 交互式桌面、PowerShell/WPF 可用、插件安装在当前 profile，并已等待配置的间隔；也可查看输入框下方的运行状态。启动失败会在 Harness 日志中带有 `[dsh-break-reminder]` 前缀。

**停用 DSH 后还在运行？** 正常卸载会终止提醒进程；宿主异常退出时，提醒进程最多约一秒后通过父进程检测自行退出。

**想换提醒文案？** 修改 `reminder.ps1` 中的 `$messages` 数组，保存为 **UTF-8 with BOM**，再重新加载插件。Windows PowerShell 5.1 需要 BOM 才能可靠读取中文脚本。

## 相关项目与反馈

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [dsh-composer-clock：输入框时钟](https://github.com/fxy0715/dsh-composer-clock)
- [dsh-pet-desktop：桌面鲸鱼](https://github.com/fxy0715/dsh-pet-desktop)
- [提交问题或建议](https://github.com/fxy0715/dsh-break-reminder/issues)；请附上 Windows 与 Harness 版本、安装方式及相关日志。
