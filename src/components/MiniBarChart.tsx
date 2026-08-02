export function MiniBarChart({
  data,
  height = 64,
  barColor = "var(--accent)",
}: {
  data: { label: string; value: number }[];
  height?: number;
  barColor?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.label}: ${d.value}`}
          style={{
            flex: 1,
            minWidth: 3,
            height: `${Math.max(3, (d.value / max) * 100)}%`,
            background: d.value > 0 ? barColor : "var(--line)",
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
