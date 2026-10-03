# ESTÁNDAR KONFÍO ZINC — Video con IA (CapCut)

> Estándar para producir videos cortos (Reels / Shorts / TikTok) con IA, para **auto-publicidad de la agencia** y como **servicio a clientes**.
> Referencia técnica: `repos-externos/capcut-mcp` (repo + `skills/capcut-reels/SKILL.md`).

---

## 🎯 Stack técnico

| Componente | Rol |
|---|---|
| **CapCut Desktop** | Editor de video (proyectos/drafts) |
| **ChatGPT / Claude (web)** | Guiones, prompts, plan de cortes, subtítulos |
| **capcut-mcp** | (Ruta C) MCP server que deja a Claude leer/editar drafts de CapCut |
| **ffmpeg / ffprobe** | Duraciones, resolución, export final |
| **WhisperFlow** (opcional) | Transcripción → subtítulos |
| **HyperFrames** (opcional) | Motion graphics / escenas animadas |

---

## 🛣️ Las 3 rutas de trabajo

| Ruta | Qué es | Estado |
|---|---|---|
| **A — Manual asistida** | Humano + ChatGPT/Claude web. La IA genera guion/plan/subtítulos; **el humano edita en CapCut**. | ✅ **ACTUAL (por defecto)** |
| **B — CapCut x Codex** | Un agente de código (Claude Code / Codex) asiste: guiones, SRT, comandos ffmpeg. Edición semi-manual. | 🔮 Futuro |
| **C — MCP automatizado** | `capcut-mcp` + Claude Code: la IA edita los drafts de CapCut vía `mcp__capcut__*`. | 🔮 Cuando se justifique |

> **Decisión (2026):** Ruta A hoy (cero setup extra, valida el workflow). Migrar a Ruta C cuando haya **10+ videos/mes** o Harness soporte MCP nativo.

---

## 📝 Los 3 prompts maestros

### 1) Estructura del guion
```
Actúa como guionista de videos cortos (Reels/Shorts). Crea el guion de un video de 30–60s para [MARCA/SERVICIO].

Salida en este formato:
- HOOK (0–3s): frase que detiene el scroll.
- CUERPO (3–45s): 3 puntos clave, uno por escena.
- CTA (45–60s): llamada a la acción (WhatsApp / agendar / visitar).

Por escena indica: texto en pantalla (máx 5 palabras), lo que se dice (voz) y la acción visual.

Reglas:
- Segunda persona ("tú").
- Una idea por frase; frases cortas.
- NUNCA cortes negaciones ("no", "nunca", "sin") de su verbo.
- Cierre con CTA accionable.
```

### 2) Plan de cortes
```
Actúa como editor de video. A partir del guion, genera el plan de cortes (storyboard) para CapCut.

Por escena indica:
- Inicio / duración (segundos).
- Clip o medio (b-roll, pantalla, foto).
- Texto en pantalla (caption).
- Transición (corte directo por defecto).

Reglas:
- Corta en respiración o cambio de idea; NUNCA en medio de una negación.
- Mantén narración y visual alineados (si recortas más rápido que la voz, ajusta velocidad).
- Máx 1 idea por escena.
```

### 3) Corrección de subtítulos (SRT)
```
Actúa como corrector de subtítulos. Corrige este SRT:

[pégale aquí la transcripción]

Reglas:
- Puntúa correctamente (comas, puntos).
- Líneas de máx 42 caracteres.
- NO cortes negaciones de su verbo.
- Corrige nombres propios y marcas.
- Conserva el tiempo de cada cue.
- Devuelve el SRT corregido.
```

---

## 🔁 Flujo para Konfio Zinc

1. **Brief** → definir objetivo, público, duración, CTA.
2. **Guion** → Prompt maestro 1 (ChatGPT/Claude).
3. **Plan de cortes** → Prompt maestro 2.
4. **Grabar / recopilar** crudos → `0-AGENCIA/MARKETING-VIDEO/raw/`.
5. **Editar en CapCut** (Ruta A) o **capcut-mcp** (Ruta C).
6. **Subtítulos** → WhisperFlow o prompt maestro 3 → corregir SRT.
7. **Exportar** → `editados/`.
8. **Publicar** → registrar en `publicados/` (fecha + red + métricas).

---

## ✅ Checklist de edición

- [ ] Hook en los primeros 3 segundos.
- [ ] Duración ≤ 60s.
- [ ] Una idea por escena.
- [ ] Negaciones intactas (no cortadas).
- [ ] Subtítulos puntuados y ≤ 42 chars/línea.
- [ ] Música libre de derechos (o del propio CapCut).
- [ ] Narración y visual alineados.
- [ ] CTA claro al final.
- [ ] Export vertical (1080×1920) para Reels/Shorts.
- [ ] Revisado en móvil antes de publicar.

---

## 🚫 Reglas específicas

1. **NUNCA cortar negaciones** ("no", "nunca", "sin") — cambia el sentido.
2. **SIEMPRE regenerar/corregir subtítulos** (puntuación, mayúsculas, marcas).
3. **NUNCA música de pago** — usar biblioteca de CapCut o librerías libres.
4. **Cerrar CapCut antes de guardar** desde el MCP (el autosave pisa los cambios; `capcut_save` se niega si CapCut está abierto).
5. **Conservar los backups `.mcpbak`** (el formato de CapCut cambia entre versiones).
6. **Tiempos en segundos** en el MCP (internamente se convierten a microsegundos).
7. **Empezar desde un borrador válido** (`capcut_clone_draft`), nunca desde JSON vacío.

---

## 📌 Referencias

- Manual **"El Editor Invisible"** (analizado) — base conceptual del flujo.
- **capcut-mcp** — `repos-externos/capcut-mcp` (README + `skills/capcut-reels/SKILL.md`).
- Herramientas del MCP: `capcut_list_drafts`, `read_timeline`, `clone_draft`, `add_video/image/audio/text`, `move/trim/split/delete_segment`, `set_props`, `validate`, `save/discard`.

---

## ⚠️ Blocker conocido

- **Ruta C (MCP) requiere Claude Code CLI** (`claude mcp add capcut ...`) **o soporte MCP nativo en Harness** (aún pendiente). Config manual vía `mcp.json` (copiar `mcp.json.example`) cuando se habilite.
- `capcut_add_text` necesita un draft con capa de texto (`CAPCUT_TEMPLATE_DRAFT`).
