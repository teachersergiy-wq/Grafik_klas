# Grafik_klas — графік чергування учнів 7 класу

Мобільний веб-застосунок без сервера. Показує, хто сьогодні черговий, і веде облік.

**Сторінка:** після увімкнення GitHub Pages —  
https://teachersergiy-wq.github.io/Grafik_klas/

## Як увімкнути GitHub Pages
1. Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main`, folder: `/ (root)`
4. Save

## Як користуватися
- **Учні** — просто відкривають сторінку, бачать чергового.
- **Староста / класний керівник** — вводять fine-grained токен GitHub (тільки цей репозиторій, Contents: Read and write).

Логін старости потрібно вписати в `CFG.head` у файлі `index.html`.

## Файли
- `index.html` — увесь застосунок
- `data.json` — учні та журнал днів
- `AGENTS.md` — інструкції для ШІ-помічника
