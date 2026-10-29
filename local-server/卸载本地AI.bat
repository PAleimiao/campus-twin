@echo off
chcp 65001 >nul
title 卸载本地 AI（Ollama + 本地模型）
cd /d "%~dp0"

echo.
echo   这个脚本会【卸载本机装的 Ollama 和本地模型文件】。
echo   只删本地模型那一套，不动你的账号、资讯、图片数据。
echo.

set NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

"%NODE_EXE%" uninstall-local-ai.js

echo.
pause
