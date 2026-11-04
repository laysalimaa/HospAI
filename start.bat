@echo off
title HospedaAI - Sistema de Atendimento com IA para Aluguel por Temporada
color 0B
cls
echo ======================================================================
echo           HOSPEDAAI - AGENTE DE IA PARA ALUGUEL POR TEMPORADA
echo      Integrado ao PMS Stays (Airbnb, Booking.com, Expedia e Direto)
echo ======================================================================
echo.
echo Instituicao: Centro Universitario de Excelencia
echo Curso:       Sistemas de Informacao
echo Disciplina:  Projetos de IA
echo Professora:  Elienaide Machado
echo Equipe:      Kailla Costa, Erick Dos Santos, Vinicius De Oliveira e Laysa Lima
echo.
echo ======================================================================
echo Iniciando servidor Node.js e banco de dados SQLite...
echo.

if exist "node.exe" (
    start http://localhost:3000
    node.exe src\server.js
) else (
    start http://localhost:3000
    node src\server.js
)

pause

