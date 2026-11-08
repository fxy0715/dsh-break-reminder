param(
  [ValidateRange(1, 1440)][int]$IntervalMinutes = 50,
  [ValidateRange(0, 2147483647)][int]$ParentPid = 0,
  [switch]$Preview,
  [switch]$Bridge
)

$ErrorActionPreference = 'Stop'
$mutex = New-Object System.Threading.Mutex($false, 'Local\dsh-break-reminder')
$owned = $false
$timer = $null
$ownerProcess = $null
try {
  try {
    $owned = $mutex.WaitOne([TimeSpan]::FromSeconds(3))
  } catch [System.Threading.AbandonedMutexException] {
    $owned = $true
  }
  if (-not $owned) { return }

  if ($ParentPid -gt 0) {
    try {
      $ownerProcess = [System.Diagnostics.Process]::GetProcessById($ParentPid)
      # Force opening a handle now, so a reused PID cannot become the new owner.
      $null = $ownerProcess.Handle
    } catch [System.ArgumentException] {
      return
    } catch [System.InvalidOperationException] {
      return
    }
  }

  Add-Type -AssemblyName PresentationFramework
  Add-Type -AssemblyName PresentationCore
  Add-Type -AssemblyName WindowsBase
  Add-Type -Path (Join-Path $PSScriptRoot 'ReminderClock.cs')

  $xaml = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'reminder.xaml') -Raw -Encoding UTF8
  $window = [System.Windows.Markup.XamlReader]::Parse($xaml)
  $message = $window.FindName('Message')
  $dismiss = $window.FindName('Dismiss')
  $app = New-Object System.Windows.Application
  $app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

  $schedule = New-Object DshBreakReminder.ReminderSchedule(
    [uint64]($IntervalMinutes * 60000), [DshBreakReminder.AwakeClock]::Milliseconds)
  $script:visibleUntil = [uint64]0
  $script:shuttingDown = $false
  $script:failure = $null
  $script:lastMessage = -1
  $messages = @(
    '忙了一阵了，起来走走、接杯水吧。',
    '手边的事可以稍等片刻，站起来舒展一下吧。',
    '给自己留一点休息时间，走两步，看看远处。'
  )

  function Hide-Reminder {
    $window.Hide()
    $script:visibleUntil = 0
    if ($Preview) { Stop-Reminder }
  }

  function Stop-Reminder {
    $script:shuttingDown = $true
    $app.Shutdown()
  }

  function Send-Status {
    if (-not $Bridge) { return }
    $status = @{
      remainingMilliseconds = $schedule.Remaining([DshBreakReminder.AwakeClock]::Milliseconds)
      visible = $window.IsVisible
    }
    [Console]::Out.WriteLine(($status | ConvertTo-Json -Compress))
  }

  function Show-Reminder {
    # Avoid repeating the same suggestion twice in a row.
    if ($script:lastMessage -lt 0) {
      $index = Get-Random -Maximum $messages.Count
    } else {
      $index = Get-Random -Maximum ($messages.Count - 1)
      if ($index -ge $script:lastMessage) { $index++ }
    }
    $script:lastMessage = $index
    $message.Text = $messages[$index]

    # Keep the card on the primary monitor's working area, above the taskbar.
    $area = [System.Windows.SystemParameters]::WorkArea
    $window.Width = [math]::Min(380, $area.Width)
    # A hidden Window reports zero DesiredSize; measure its visible content instead.
    $window.Content.Measure([System.Windows.Size]::new($window.Width, [double]::PositiveInfinity))
    $window.Left = [math]::Max($area.Left, $area.Right - $window.Width - 4)
    $window.Top = [math]::Max($area.Top, $area.Bottom - $window.Content.DesiredSize.Height - 4)
    $script:visibleUntil = [DshBreakReminder.AwakeClock]::Milliseconds + 10000
    $window.Show()
  }

  $dismiss.Add_Click({ Hide-Reminder })
  $window.Add_Closing({
    param($sender, $eventArgs)
    if (-not $script:shuttingDown) {
      $eventArgs.Cancel = $true
      Hide-Reminder
    }
  })

  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromSeconds(1)
  $timer.Add_Tick({
    try {
      if ($ownerProcess -and $ownerProcess.HasExited) {
        Stop-Reminder
        return
      }
      $now = [DshBreakReminder.AwakeClock]::Milliseconds
      if ($script:visibleUntil -gt 0 -and $now -ge $script:visibleUntil) {
        Hide-Reminder
      }
      if (-not $Preview -and $schedule.Poll($now)) { Show-Reminder }
      Send-Status
    } catch {
      $script:failure = $_
      Stop-Reminder
    }
  })
  $timer.Start()
  if ($Preview) { Show-Reminder }
  Send-Status
  [void]$app.Run()
  if ($script:failure) { throw $script:failure }
} finally {
  $script:shuttingDown = $true
  if ($timer) { $timer.Stop() }
  if ($window) { $window.Close() }
  if ($ownerProcess) { $ownerProcess.Dispose() }
  if ($owned) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
