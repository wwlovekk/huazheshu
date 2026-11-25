!macro customInstall
  ; Associate the installed app with Windows toast notifications.
  WriteRegStr SHCTX "Software\Classes\AppUserModelId\local.huazheshu.desktop" "DisplayName" "划着数"
  WriteRegStr SHCTX "Software\Classes\AppUserModelId\local.huazheshu.desktop" "IconUri" "$INSTDIR\划着数.exe"
  WriteRegStr SHCTX "Software\Classes\huazheshu" "" "URL:划着数提醒"
  WriteRegStr SHCTX "Software\Classes\huazheshu" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\huazheshu\shell\open\command" "" '$\"$INSTDIR\划着数.exe$\" $\"%1$\"'
!macroend
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "local.huazheshu.desktop"
  DeleteRegKey SHCTX "Software\Classes\huazheshu"
  DeleteRegKey SHCTX "Software\Classes\AppUserModelId\local.huazheshu.desktop"
!macroend
