using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace DshBreakReminder
{
    public static class AwakeClock
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool QueryUnbiasedInterruptTime(out ulong time);

        // Windows excludes sleep and hibernation from this monotonic clock.
        public static ulong Milliseconds
        {
            get
            {
                ulong time;
                if (!QueryUnbiasedInterruptTime(out time))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                return time / 10000;
            }
        }
    }

    public sealed class ReminderSchedule
    {
        private readonly ulong interval;
        private ulong nextReminder;

        public ReminderSchedule(ulong intervalMilliseconds, ulong now)
        {
            if (intervalMilliseconds == 0)
                throw new ArgumentOutOfRangeException("intervalMilliseconds");
            interval = intervalMilliseconds;
            nextReminder = now + interval;
        }

        public bool Poll(ulong now)
        {
            if (now < nextReminder) return false;
            // Delayed dispatch emits one card, never a backlog of missed cards.
            nextReminder = now + interval;
            return true;
        }

        public ulong Remaining(ulong now)
        {
            return now >= nextReminder ? 0 : nextReminder - now;
        }
    }
}
