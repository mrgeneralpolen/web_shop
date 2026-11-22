import { useEffect, useMemo, useState } from "react";
import { getDbSchema } from "../api";
import type { DbSchema, DbTable } from "../types";

interface Props {
  onBack: () => void;
}

/** Раскладка ERD: три колонки таблиц (слева направо). */
const ERD_COLUMNS: string[][] = [
  ["users", "roles", "user_roles", "permissions", "role_permissions"],
  [
    "sessions",
    "refresh_tokens",
    "password_resets",
    "login_attempts",
    "audit_log",
    "oauth_accounts",
  ],
  ["products", "cart_items", "orders", "order_items"],
];

const BOX_W = 250;
const COL_GAP = 36;
const ROW_H = 21;
const HEADER_H = 30;
const BOX_GAP = 26;

function boxHeight(table: DbTable): number {
  return HEADER_H + table.columns.length * ROW_H + 8;
}

export default function DbViewer({ onBack }: Props) {
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"tables" | "erd">("tables");
  const [selected, setSelected] = useState<string>("users");

  useEffect(() => {
    getDbSchema()
      .then((s) => {
        setSchema(s);
        if (s.tables.length > 0) setSelected(s.tables[0].name);
      })
      .catch(() => setError("Не удалось загрузить схему базы данных."));
  }, []);

  const selectedTable = useMemo(
    () => schema?.tables.find((t) => t.name === selected) ?? null,
    [schema, selected],
  );

  /** Позиции таблиц на ERD и связи между ними. */
  const erd = useMemo(() => {
    if (!schema) return null;
    const byName = new Map(schema.tables.map((t) => [t.name, t]));
    const pos = new Map<string, { x: number; y: number; h: number }>();
    ERD_COLUMNS.forEach((col, ci) => {
      let y = 0;
      col.forEach((name) => {
        const t = byName.get(name);
        if (!t) return;
        const h = boxHeight(t);
        pos.set(name, { x: ci * (BOX_W + COL_GAP), y, h });
        y += h + BOX_GAP;
      });
    });
    // Таблицы, не попавшие в раскладку, — в конец третьей колонки.
    let extraY =
      Math.max(
        ...ERD_COLUMNS.map((col) =>
          col.reduce(
            (s, n) => s + (byName.get(n) ? boxHeight(byName.get(n)!) : 0) + BOX_GAP,
            0,
          ),
        ),
      ) || 0;
    schema.tables.forEach((t) => {
      if (!pos.has(t.name)) {
        const h = boxHeight(t);
        pos.set(t.name, { x: 2 * (BOX_W + COL_GAP), y: extraY, h });
        extraY += h + BOX_GAP;
      }
    });
    const width = 3 * BOX_W + 2 * COL_GAP;
    const height = Math.max(...[...pos.values()].map((p) => p.y + p.h));
    const links: { d: string; key: string }[] = [];
    schema.tables.forEach((t) => {
      const from = pos.get(t.name);
      if (!from) return;
      t.columns.forEach((col, ci) => {
        if (!col.foreign_key) return;
        const to = pos.get(col.foreign_key.table);
        if (!to) return;
        const x1 = from.x + BOX_W;
        const y1 = from.y + HEADER_H + ci * ROW_H + ROW_H / 2;
        const x2 = to.x;
        const y2 = to.y + HEADER_H + ROW_H / 2;
        const mx = (x1 + x2) / 2;
        links.push({
          key: `${t.name}.${col.name}`,
          d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        });
      });
    });
    return { byName, pos, width, height, links };
  }, [schema]);

  return (
    <div className="db-viewer">
      <div className="breadcrumbs">
        <button onClick={onBack}>Каталог</button> <span>/</span>{" "}
        <span>База данных</span>
      </div>
      <h1>База данных</h1>
      <p className="sub">
        Структура базы данных магазина: таблицы модуля авторизации и таблицы
        магазина. Схема строится из моделей бэкенда и всегда соответствует
        реальной базе.
      </p>

      {error && <div className="form-error">{error}</div>}
      {!schema && !error && <p>Загрузка схемы…</p>}

      {schema && (
        <>
          <div className="db-tabs">
            <button
              className={tab === "tables" ? "active" : ""}
              onClick={() => setTab("tables")}
            >
              Таблицы ({schema.tables.length})
            </button>
            <button
              className={tab === "erd" ? "active" : ""}
              onClick={() => setTab("erd")}
            >
              ERD-диаграмма
            </button>
          </div>

          {tab === "tables" && selectedTable && (
            <div className="db-layout">
              <div className="db-list">
                {schema.tables.map((t) => (
                  <button
                    key={t.name}
                    className={t.name === selected ? "active" : ""}
                    onClick={() => setSelected(t.name)}
                  >
                    <span className="db-list-name">{t.name}</span>
                    <span className="db-list-rows">{t.rows} строк</span>
                  </button>
                ))}
              </div>
              <div className="db-detail">
                <h2>
                  {selectedTable.name}
                  <span className="db-rows">{selectedTable.rows} строк</span>
                </h2>
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>Столбец</th>
                      <th>Тип</th>
                      <th>NULL</th>
                      <th>Ключи</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTable.columns.map((c) => (
                      <tr key={c.name}>
                        <td>
                          <code>{c.name}</code>
                        </td>
                        <td>
                          <code>{c.type}</code>
                        </td>
                        <td>{c.nullable ? "да" : "нет"}</td>
                        <td>
                          {[
                            c.primary_key ? "PK" : "",
                            c.foreign_key
                              ? `FK → ${c.foreign_key.table}.${c.foreign_key.column}`
                              : "",
                            c.unique ? "UNIQUE" : "",
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "erd" && erd && (
            <div className="db-erd-scroll">
              <svg
                className="db-erd"
                width={erd.width}
                height={erd.height}
                role="img"
                aria-label="ERD-диаграмма базы данных"
              >
                <defs>
                  <marker
                    id="erd-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#0d5cb6" />
                  </marker>
                </defs>
                {erd.links.map((l) => (
                  <path
                    key={l.key}
                    d={l.d}
                    fill="none"
                    stroke="#0d5cb6"
                    strokeOpacity="0.55"
                    strokeWidth="1.5"
                    markerEnd="url(#erd-arrow)"
                  />
                ))}
                {[...erd.pos.entries()].map(([name, p]) => {
                  const t = erd.byName.get(name)!;
                  return (
                    <g key={name}>
                      <rect
                        x={p.x}
                        y={p.y}
                        width={BOX_W}
                        height={p.h}
                        rx="6"
                        fill="#ffffff"
                        stroke="#d9dfe7"
                      />
                      <rect
                        x={p.x}
                        y={p.y}
                        width={BOX_W}
                        height={HEADER_H}
                        rx="6"
                        fill="#0d5cb6"
                      />
                      <rect
                        x={p.x}
                        y={p.y + HEADER_H - 6}
                        width={BOX_W}
                        height="6"
                        fill="#0d5cb6"
                      />
                      <text
                        x={p.x + 10}
                        y={p.y + 20}
                        fill="#ffffff"
                        fontSize="13"
                        fontWeight="700"
                      >
                        {name}
                      </text>
                      {t.columns.map((c, ci) => (
                        <text
                          key={c.name}
                          x={p.x + 10}
                          y={p.y + HEADER_H + ci * ROW_H + 15}
                          fontSize="12"
                          fill={c.primary_key ? "#0d5cb6" : "#182430"}
                          fontWeight={c.primary_key ? "700" : "400"}
                        >
                          {c.primary_key ? "PK " : c.foreign_key ? "FK " : ""}
                          {c.name}
                          <tspan fill="#5b6b7b"> · {c.type}</tspan>
                        </text>
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}
