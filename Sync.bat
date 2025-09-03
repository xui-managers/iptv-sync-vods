::[Bat To Exe Converter]
::
::YAwzoRdxOk+EWAjk
::fBw5plQjdCyDJGm222gVHDRncAWWMGqpFrkd8dTy//6R71sSUK8waoja1L2UJfIv61b3cII+6nNZl8VCBRhXHg==
::YAwzuBVtJxjWCl3EqQJgSA==
::ZR4luwNxJguZRRnk
::Yhs/ulQjdF+5
::cxAkpRVqdFKZSDk=
::cBs/ulQjdF+5
::ZR41oxFsdFKZSDk=
::eBoioBt6dFKZSDk=
::cRo6pxp7LAbNWATEpCI=
::egkzugNsPRvcWATEpCI=
::dAsiuh18IRvcCxnZtBJQ
::cRYluBh/LU+EWAnk
::YxY4rhs+aU+JeA==
::cxY6rQJ7JhzQF1fEqQJQ
::ZQ05rAF9IBncCkqN+0xwdVs0
::ZQ05rAF9IAHYFVzEqQJQ
::eg0/rx1wNQPfEVWB+kM9LVsJDGQ=
::fBEirQZwNQPfEVWB+kM9LVsJDGQ=
::cRolqwZ3JBvQF1fEqQJQ
::dhA7uBVwLU+EWDk=
::YQ03rBFzNR3SWATElA==
::dhAmsQZ3MwfNWATElA==
::ZQ0/vhVqMQ3MEVWAtB9wSA==
::Zg8zqx1/OA3MEVWAtB9wSA==
::dhA7pRFwIByZRRnk
::Zh4grVQjdCyDJGm222gVHDRncByWLm67C/gP8eb409merE5PGucnfe8=
::YB416Ek+ZG8=
::
::
::978f952a14a936cc963da21a135fa983
@echo off
REM Caminho relativo para o Node portátil
set NODE_PATH=%~dp0\node-portable\node.exe

REM Verifica se o arquivo .env existe
if not exist "%~dp0.env" (
    echo Arquivo .env nao encontrado!
    echo Por favor, crie o arquivo .env antes de rodar o app.
    pause
    exit /b
)
REM Inicializa flags
set "DB_HOST_OK=0"
set "DB_USER_OK=0"

REM Lê o .env linha por linha
for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
    if /i "%%A"=="DB_HOST" if not "%%B"=="" set DB_HOST_OK=1
    if /i "%%A"=="DB_USER" if not "%%B"=="" set DB_USER_OK=1
)


if %DB_HOST_OK%==0 (
    echo A variavel DB_HOST nao esta preenchida no .env
)
if %DB_USER_OK%==0 (
    echo A variavel DB_USER nao esta preenchida no .env
)

REM Se alguma estiver faltando, termina o script
if %DB_HOST_OK%==0 (
    pause
    exit /b
)
if %DB_USER_OK%==0 (
    pause
    exit /b
)

REM -----------------------------
REM 4️⃣ Verifica se node_modules existe
if not exist "%~dp0\node_modules" (
    echo Instalando dependencias do projeto...
    "%NPM_PATH%" install
)

REM Rodando app
"%NODE_PATH%" index.js

pause
