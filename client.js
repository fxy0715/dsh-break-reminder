window.__ModuleLoader__.load({
  id: '@local/dsh-break-reminder',
  factory(require) {
    const React = require('react');
    const CHANNEL = '/api';
    const STYLE_ID = 'dsh-break-reminder-status-style';
    const CSS = [
      '[data-composer-dock]:has(.dsh-break-reminder-status){flex-wrap:wrap;gap:2px 8px;}',
      '.dsh-break-reminder-status{display:inline-flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0;max-width:100%;min-height:24px;box-sizing:border-box;padding:2px 6px;margin:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1.4;text-align:left;}',
      '.dsh-break-reminder-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary,#8c9692);flex:none;}',
      '.dsh-break-reminder-dot[data-phase="running"]{background:var(--dsw-alias-state-success-primary,#2f7567);}',
      '.dsh-break-reminder-dot[data-phase="failed"],.dsh-break-reminder-dot[data-phase="stopped"]{background:#a04c36;}',
      '.dsh-break-reminder-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    ].join('\n');

    function statusText(status) {
      if (status.phase === 'starting') return '休息提醒正在启动…';
      if (status.phase === 'running') {
        if (status.visible) return '休息提醒已开启 · 正在提醒';
        const minutes = Math.max(1, Math.ceil(status.remainingMilliseconds / 60000));
        return '休息提醒已开启 · 约 ' + minutes + ' 分钟后提醒';
      }
      if (status.phase === 'failed' || status.phase === 'stopped') return '休息提醒未运行';
      return '休息提醒状态暂不可用';
    }

    function StatusPanel(ctx) {
      const [status, setStatus] = React.useState({ phase: 'starting' });

      React.useEffect(() => {
        let active = true;
        let polling = false;
        const controller = new AbortController();
        const refresh = async () => {
          if (polling || !active) return;
          polling = true;
          try {
            const result = await ctx.connection.rpc.call(CHANNEL, 'dsh-break-reminder/status', {}, controller.signal);
            if (!result.ok) throw new Error(result.error.message);
            if (active) setStatus(result.value);
          } catch {
            if (active) setStatus({ phase: 'unresponsive' });
          } finally { polling = false; }
        };
        refresh();
        const stopTimer = ctx.timer.interval(refresh, 5000);
        return () => {
          active = false;
          controller.abort();
          stopTimer();
        };
      }, []);

      const text = statusText(status);
      const label = status.phase === 'running' && !status.visible
        ? '约 ' + Math.max(1, Math.ceil(status.remainingMilliseconds / 60000)) + ' 分钟后休息'
        : text;
      return React.createElement('span', {
        className: 'dsh-break-reminder-status', role: 'status', title: text,
        'aria-label': text,
      },
      React.createElement('span', { className: 'dsh-break-reminder-dot', 'data-phase': status.phase, 'aria-hidden': true }),
      React.createElement('span', { className: 'dsh-break-reminder-label' }, label));
    }

    return {
      inject: ['slots', 'timer', 'connection'],
      apply(ctx) {
        const cleanups = [];
        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement('style');
          style.id = STYLE_ID;
          style.textContent = CSS;
          document.head.appendChild(style);
          cleanups.push(() => style.remove());
        }
        cleanups.push(ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'dsh-break-reminder-status', order: 6, label: '休息提醒',
        }, () => StatusPanel(ctx))));
        return () => { for (const dispose of cleanups) if (typeof dispose === 'function') dispose(); };
      },
    };
  },
});
