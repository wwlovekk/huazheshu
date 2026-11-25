$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'

dotnet restore native/Huazheshu.csproj --configfile native/NuGet.Config
if ($LASTEXITCODE) { exit $LASTEXITCODE }
dotnet build native/Huazheshu.csproj --configuration Release --no-restore --output out/desktop
if ($LASTEXITCODE) { exit $LASTEXITCODE }

# WinForms uses the x64 loader already present at the root of the build.
Get-ChildItem -LiteralPath 'out/desktop' -Filter '*.pdb' -File | Remove-Item
foreach ($file in @('Microsoft.Web.WebView2.Wpf.dll', 'runtimes/win-x64/native/WebView2Loader.dll')) {
  $target = Join-Path 'out/desktop' $file
  if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target }
}
node scripts/notices.mjs
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Copy-Item -LiteralPath 'LICENSE', 'THIRD_PARTY_NOTICES.txt' -Destination 'out/desktop'
