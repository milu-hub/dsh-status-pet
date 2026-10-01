# Capture a screen region to a PNG for visual verification.
# Usage: powershell -File tools/screenshot.ps1 -Out shot.png [-Left 0] [-Top 0] [-W 1920] [-H 1080]

param(
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Left = -999999,
  [int]$Top = -999999,
  [int]$W = 0,
  [int]$H = 0
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screenBounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($Left -eq -999999) { $Left = $screenBounds.X }
if ($Top -eq -999999) { $Top = $screenBounds.Y }
if ($W -le 0) { $W = $screenBounds.Width }
if ($H -le 0) { $H = $screenBounds.Height }

$bitmap = New-Object System.Drawing.Bitmap($W, $H)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($Left, $Top, 0, 0, $bitmap.Size)
$graphics.Dispose()

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output "saved $Out ($W x $H from $Left,$Top)"
