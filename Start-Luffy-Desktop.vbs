Set shell = CreateObject("WScript.Shell")
scriptPath = "C:\Users\licci\Documents\Codex\2026-04-19-ecco-il-codice-per-un-agente\Start-Luffy-Desktop.ps1"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """"
shell.Run command, 0, False
