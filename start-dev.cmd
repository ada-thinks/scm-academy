@echo off
cd /d d:\lls\project\scm-academy
"%APPDATA%\nvm\v22.23.2\node.exe" node_modules\next\dist\bin\next dev --turbopack > dev-server.log 2>&1
