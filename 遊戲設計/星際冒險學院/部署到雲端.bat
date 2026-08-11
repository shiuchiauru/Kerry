@echo off
chcp 65001 >nul
title Star Academy Deploy
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
