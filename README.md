# D1 · Rebold Audit — Cuadro de mando

Cuadro de control del primer **Rebold Audit**: Zelva reporta cada ajuste que pide la auditoría, Rebold lo valida, y solo entonces se mueve el **ORI** (Optimization Readiness Index).

Publicado en https://sebastianromero-rebold.github.io/AuditoriaD1/

## Modos

| Modo | Cuándo | Qué hace |
|---|---|---|
| **Oficial · solo lectura** | `CONFIG.BACKEND_URL` vacío en `index.html` | Muestra el corte oficial del Google Sheet guardado en `data.js` (fecha del corte en el encabezado). No permite reportar ni validar. |
| **Oficial · en vivo** | `CONFIG.BACKEND_URL` con la URL `/exec` del Apps Script | Lee el Google Sheet en cada carga, pide nombre y código de acceso, y habilita el flujo Zelva → Rebold con Slack y log. |

## Qué muestra (de lo macro a lo micro)

| Pestaña | Contenido |
|---|---|
| 1 · ORI | ORI validado, banda de lectura, línea base de la auditoría, potencial si se aprueba lo pendiente y la ruta semana a semana si cada hallazgo se aprueba en su fecha límite. |
| 2 · Indicadores y criterios | AES, CES, UXCS y AIS; cada uno abierto en sus criterios con peso, score 0–10, porcentaje, aporte al indicador y la evidencia cargada en `Mediciones_Mensuales`. |
| 3 · Seguimiento | Los hallazgos de `Alertas_QuickWins_Acciones`, filtrables por tipo, prioridad, responsable, indicador, criterio, horizonte, estado, validación y rango de fechas. |
| 4 · Eficiencia | Tiempo de resolución de Zelva (desde la detección), tiempo de validación de Rebold, ciclo completo, cumplimiento de fecha límite y vencidas, por indicador, horizonte y responsable. Exporta CSV. |
| 5 · Bitácora | Cada alta, cambio de estado y validación con fecha, hora y usuario. Exporta CSV. |
| 6 · Rúbrica | Consulta de la rúbrica 0–10 por criterio, con la banda actual de D1 resaltada. |

## Regla del ORI

```
score criterio = línea base (último mes de Mediciones_Mensuales) + Σ delta de los hallazgos APROBADOS por Rebold
indicador     = Σ (peso del criterio × score) × 10        ← promedio ponderado con los pesos de la hoja Criterios
ORI           = promedio de AES, CES, UXCS y AIS (25% c/u)
```

- Línea base oficial (sep-2026): AES 35,5 · CES 44,0 · UXCS 40,0 · AIS 30,5 → **ORI 37,5 (Crítico)**.
- `delta` por defecto: Alta 1,0 · Media 0,5 · Baja 0,3 puntos sobre el criterio; 0 si el hallazgo está descartado o es "PENDIENTE POR AUDITAR". Si se aprueba todo lo abierto, el ORI llega a ~56,8.
- Lo que Zelva marca como *Realizado* queda en **Pendiente validación** y no mueve el ORI; se ve aparte como *potencial*.
- Cuando operaciones carga una medición mensual nueva, esa medición pasa a ser la línea base y solo cuentan las aprobaciones posteriores.

## Flujo en vivo

1. Operaciones o Rebold registran el hallazgo en `Alertas_QuickWins_Acciones` (o Rebold lo sube desde el dashboard). El script le asigna un ID (`S01`, `S02`…) en la columna L y crea su fila en la hoja `Seguimiento` con criterio, horizonte y delta (editables en esa hoja).
2. **Zelva** lo marca: *En curso*, *Realizado*, *Necesita apoyo* o *No se pudo realizar* (las tres últimas exigen el porqué).
3. Cada cambio **notifica a Rebold por Slack** con el enlace directo al hallazgo.
4. **Rebold** aprueba (mueve el ORI), devuelve a Zelva, ratifica un cierre no realizable o registra el apoyo.
5. La columna *Estado* de `Alertas_QuickWins_Acciones` se actualiza sola (Pendiente / En curso / Completado / Descartado), así `Resumen_ORI` sigue contando bien.
6. Todo queda en `Log_Cambios` y en el Google Sheet de respaldo `D1_Rebold_Audit_Log_Respaldo`, con una copia completa del registro en cada movimiento.

## Encender el modo en vivo

1. En el Google Sheet: *Extensiones → Apps Script*. Pegar `apps-script/Code.gs` y crear `Seed.gs` con `apps-script/Seed.gs`.
2. *Configuración del proyecto → Propiedades del script*: `ZELVA_CODE`, `REBOLD_CODE`, opcional `LECTURA_CODE`; `SLACK_BOT_TOKEN` (bot con `chat:write`) y `SLACK_REBOLD_ID` (usuario U… o canal C…), o `SLACK_WEBHOOK_URL`; `DASHBOARD_URL` = `https://sebastianromero-rebold.github.io/AuditoriaD1/`. Los códigos nunca van en el repositorio.
3. Ejecutar `setup()` una vez (autoriza permisos): crea `Seguimiento`, `Log_Cambios`, la columna `ID_Seguimiento` y el Sheet de respaldo, y registra los hallazgos actuales. Opcional: `probarSlack()`.
4. *Implementar → Nueva implementación → Aplicación web*: ejecutar como *yo*, acceso *cualquier persona*. Pegar la URL `/exec` en `CONFIG.BACKEND_URL` de `index.html` y publicar.

## Pendientes del Sheet

- `Mediciones_Mensuales` conserva la fila de ejemplo de UXCS-5 (30 sep, "Nombre responsable"). No afecta el cálculo (se toma la carga más reciente), pero conviene borrarla.
- `Resumen_ORI` usa `AVERAGEIFS` (promedio simple → 37,3); el dashboard usa promedio ponderado (37,5). Fórmula ponderada sugerida para AES (fila 2), igual para los demás:
  ```
  =IFERROR(ROUND(SUMPRODUCT((Mediciones_Mensuales!$A$3:$A$400=$A2)*(Mediciones_Mensuales!$C$3:$C$400="AES")*Mediciones_Mensuales!$F$3:$F$400*IFERROR(VLOOKUP(Mediciones_Mensuales!$D$3:$D$400,Criterios!$A:$E,5,0),0))/SUMPRODUCT((Mediciones_Mensuales!$A$3:$A$400=$A2)*(Mediciones_Mensuales!$C$3:$C$400="AES")*IFERROR(VLOOKUP(Mediciones_Mensuales!$D$3:$D$400,Criterios!$A:$E,5,0),0))*10,1),"")
  ```

## Archivos

- `index.html`: el dashboard completo (HTML/CSS/JS sin dependencias).
- `data.js`: corte oficial del Google Sheet para el modo solo lectura.
- `apps-script/Code.gs`, `apps-script/Seed.gs`: backend en Google Apps Script y clasificación inicial (criterio, horizonte, delta) de los 63 hallazgos.
