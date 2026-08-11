@echo off
chcp 65001 >nul
title Star Academy
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
