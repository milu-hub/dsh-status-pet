# List visible top-level windows, with class and rectangle.
# Usage: powershell -File tools/windows.ps1

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$results = New-Object System.Collections.ArrayList
$callback = [Win+EnumWindowsProc]{
  param($hWnd, $lParam)
  if ([Win]::IsWindowVisible($hWnd)) {
    $title = New-Object System.Text.StringBuilder 512
    [void][Win]::GetWindowText($hWnd, $title, 512)
    $class = New-Object System.Text.StringBuilder 256
    [void][Win]::GetClassName($hWnd, $class, 256)
    $rect = New-Object Win+RECT
    [void][Win]::GetWindowRect($hWnd, [ref]$rect)
    if ($title.Length -gt 0) {
      [void]$results.Add([pscustomobject]@{
        Handle = ('0x{0:X}' -f $hWnd.ToInt64())
        Title  = $title.ToString()
        Class  = $class.ToString()
        Rect   = "$($rect.Left),$($rect.Top) $($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"
      })
    }
  }
  return $true
}
[void][Win]::EnumWindows($callback, [IntPtr]::Zero)
$results | Format-Table -AutoSize -Wrap
