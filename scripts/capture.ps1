param([string]$OutPath = "screen.png")
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[Win32]::SetProcessDPIAware() | Out-Null

$p = Get-Process DiskSweeper -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and [Win32]::IsWindowVisible($_.MainWindowHandle) } | Select-Object -First 1
if (-not $p) { Write-Error "DiskSweeper window not found"; exit 1 }
$hwnd = $p.MainWindowHandle

# 最小化其它窗口，把 DiskSweeper 最大化置前
$shell = New-Object -ComObject Shell.Application
$shell.MinimizeAll()
Start-Sleep -Milliseconds 600
[Win32]::ShowWindow($hwnd, 3) | Out-Null  # SW_MAXIMIZE
[Win32]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 500
for ($i = 0; $i -lt 10; $i++) {
    if ([Win32]::GetForegroundWindow() -eq $hwnd) { break }
    [Win32]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 400
}
if ([Win32]::GetForegroundWindow() -ne $hwnd) { Write-Error "DiskSweeper is not foreground"; exit 2 }
Start-Sleep -Milliseconds 600

$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "saved $OutPath ($w x $h)"
