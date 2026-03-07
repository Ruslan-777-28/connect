#!/bin/bash
# Зупинити виконання при помилці
set -e

echo "[system] Створення віртуального середовища у .venv..."
python3 -m venv .venv

echo "[system] Активація середовища..."
# Використовуємо 'source' для активації у поточному шелі
source .venv/bin/activate

echo "[system] Оновлення pip..."
python3 -m pip install --upgrade pip

echo "[system] Встановлення залежностей з requirements.txt..."
python3 -m pip install -r requirements.txt

echo "[system] Налаштування завершено!"
echo "[system] Для активації середовища вручну виконайте: source .venv/bin/activate"
