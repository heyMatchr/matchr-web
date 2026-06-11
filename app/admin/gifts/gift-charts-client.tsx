"use client";

import { useEffect, useRef, useState } from "react";

export type GiftChartRow = {
  label: string;
  secondary?: string;
  tooltip: {
    label: string;
    value: string;
  }[];
  value: number;
};

type GiftChartsClientProps = {
  activityTrendRows: GiftChartRow[];
  highestRevenueRows: GiftChartRow[];
  mostSentRows: GiftChartRow[];
  priceBandRows: GiftChartRow[];
  repeatRateRows: GiftChartRow[];
};

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-[300px] place-items-center px-5 text-center text-sm text-neutral-400">
      {message}
    </div>
  );
}

function Tooltip({
  row,
  title,
}: {
  row: GiftChartRow;
  title: string;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 w-60 rounded-2xl border border-white/10 bg-black/90 p-3 text-xs shadow-2xl backdrop-blur">
      <p className="font-black text-white">{row.label}</p>
      <p className="mt-1 text-neutral-500">{title}</p>
      <div className="mt-3 grid gap-2">
        {row.tooltip.map((item) => (
          <div key={`${row.label}-${item.label}`} className="flex justify-between gap-3">
            <span className="text-neutral-400">{item.label}</span>
            <span className="font-black text-[#E8C46A]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function useOutsideClear(
  ref: React.RefObject<HTMLElement | null>,
  clear: () => void,
) {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        clear();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [clear, ref]);
}

function ChartFrame({
  children,
  empty,
  title,
}: {
  children: React.ReactNode;
  empty: string;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">{empty}</p>
        </div>
        <span className="rounded-full border border-[#C8A24A]/25 bg-[#C8A24A]/10 px-3 py-1 text-xs font-bold text-[#E8C46A]">
          Hover / tap
        </span>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-neutral-900 bg-black/60">
        {children}
      </div>
    </section>
  );
}

function InteractiveVerticalBarChart({
  empty,
  formatter = formatNumber,
  rows,
  title,
}: {
  empty: string;
  formatter?: (value: number) => string;
  rows: GiftChartRow[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRows = rows.slice(0, 8);
  const width = 720;
  const height = 260;
  const pad = { bottom: 48, left: 44, right: 20, top: 18 };
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));
  const chartWidth = width - pad.left - pad.right;
  const barWidth = Math.max(18, chartWidth / Math.max(1, chartRows.length) - 12);
  const xFor = (index: number) =>
    pad.left + (index + 0.5) * (chartWidth / Math.max(1, chartRows.length));
  const yFor = (value: number) =>
    height - pad.bottom - (value / maxValue) * (height - pad.top - pad.bottom);

  useOutsideClear(containerRef, () => setActiveIndex(null));

  return (
    <ChartFrame empty={empty} title={title}>
      <div ref={containerRef} className="relative">
        {chartRows.length ? (
          <>
            <svg
              className="h-[300px] w-full touch-none"
              onPointerLeave={() => setActiveIndex(null)}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = pad.top + tick * (height - pad.top - pad.bottom);

                return (
                  <g key={tick}>
                    <line
                      stroke="rgba(255,255,255,0.07)"
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={y}
                      y2={y}
                    />
                    <text fill="rgba(255,255,255,0.38)" fontSize="10" x="4" y={y + 3}>
                      {formatter(maxValue * (1 - tick))}
                    </text>
                  </g>
                );
              })}
              {chartRows.map((row, index) => {
                const x = xFor(index) - barWidth / 2;
                const y = yFor(row.value);
                const barHeight = height - pad.bottom - y;
                const isActive = activeIndex === index;

                return (
                  <g
                    key={`${title}-${row.label}`}
                    onPointerEnter={() => setActiveIndex(index)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setActiveIndex(index);
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      fill={isActive ? "#E8C46A" : "#C8A24A"}
                      height={barHeight}
                      opacity={isActive ? "1" : "0.9"}
                      rx="6"
                      width={barWidth}
                      x={x}
                      y={y}
                    />
                    <text
                      fill="#E8C46A"
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="middle"
                      x={xFor(index)}
                      y={Math.max(13, y - 7)}
                    >
                      {formatter(row.value)}
                    </text>
                    <text
                      fill="rgba(255,255,255,0.48)"
                      fontSize="10"
                      textAnchor="middle"
                      x={xFor(index)}
                      y={height - 24}
                    >
                      {row.label.length > 10 ? `${row.label.slice(0, 10)}...` : row.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {activeIndex !== null && chartRows[activeIndex] ? (
              <Tooltip row={chartRows[activeIndex]} title={title} />
            ) : null}
          </>
        ) : (
          <EmptyChart message={empty} />
        )}
      </div>
    </ChartFrame>
  );
}

function InteractiveHorizontalBarChart({
  empty,
  formatter = formatNumber,
  rows,
  title,
}: {
  empty: string;
  formatter?: (value: number) => string;
  rows: GiftChartRow[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRows = rows.slice(0, 7);
  const width = 720;
  const height = 260;
  const pad = { bottom: 24, left: 150, right: 78, top: 18 };
  const rowGap = 10;
  const rowHeight = Math.max(
    18,
    (height - pad.top - pad.bottom - rowGap * Math.max(0, chartRows.length - 1)) /
      Math.max(1, chartRows.length),
  );
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));
  const chartWidth = width - pad.left - pad.right;

  useOutsideClear(containerRef, () => setActiveIndex(null));

  return (
    <ChartFrame empty={empty} title={title}>
      <div ref={containerRef} className="relative">
        {chartRows.length ? (
          <>
            <svg
              className="h-[300px] w-full touch-none"
              onPointerLeave={() => setActiveIndex(null)}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const x = pad.left + tick * chartWidth;

                return (
                  <line
                    key={tick}
                    stroke="rgba(255,255,255,0.07)"
                    x1={x}
                    x2={x}
                    y1={pad.top}
                    y2={height - pad.bottom}
                  />
                );
              })}
              {chartRows.map((row, index) => {
                const y = pad.top + index * (rowHeight + rowGap);
                const barWidth = Math.max(4, (row.value / maxValue) * chartWidth);
                const isActive = activeIndex === index;

                return (
                  <g
                    key={`${title}-${row.label}`}
                    onPointerEnter={() => setActiveIndex(index)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setActiveIndex(index);
                    }}
                    className="cursor-pointer"
                  >
                    <text
                      fill="rgba(255,255,255,0.72)"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="end"
                      x={pad.left - 10}
                      y={y + rowHeight / 2 + 4}
                    >
                      {row.label.length > 18 ? `${row.label.slice(0, 18)}...` : row.label}
                    </text>
                    <rect
                      fill="rgba(255,255,255,0.05)"
                      height={rowHeight}
                      rx="6"
                      width={chartWidth}
                      x={pad.left}
                      y={y}
                    />
                    <rect
                      fill={isActive ? "#E8C46A" : "#C8A24A"}
                      height={rowHeight}
                      rx="6"
                      width={barWidth}
                      x={pad.left}
                      y={y}
                    />
                    <text
                      fill="#E8C46A"
                      fontSize="12"
                      fontWeight="700"
                      x={pad.left + barWidth + 8}
                      y={y + rowHeight / 2 + 4}
                    >
                      {formatter(row.value)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {activeIndex !== null && chartRows[activeIndex] ? (
              <Tooltip row={chartRows[activeIndex]} title={title} />
            ) : null}
          </>
        ) : (
          <EmptyChart message={empty} />
        )}
      </div>
    </ChartFrame>
  );
}

export function GiftChartsClient({
  activityTrendRows,
  highestRevenueRows,
  mostSentRows,
  priceBandRows,
  repeatRateRows,
}: GiftChartsClientProps) {
  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <InteractiveVerticalBarChart
        empty="No sent gifts yet."
        rows={mostSentRows}
        title="Gift Sends by Gift"
      />
      <InteractiveVerticalBarChart
        empty="No Gold revenue yet."
        rows={highestRevenueRows}
        title="Gold Generated by Gift"
      />
      <InteractiveVerticalBarChart
        empty="No price band revenue yet."
        rows={priceBandRows}
        title="Price Band Performance"
      />
      <InteractiveVerticalBarChart
        empty="Not enough gift activity yet."
        rows={activityTrendRows}
        title="Gift Activity Trend"
      />
      <InteractiveHorizontalBarChart
        empty="No repeat gift behavior yet."
        formatter={formatPercent}
        rows={repeatRateRows}
        title="Repeat Behavior"
      />
    </section>
  );
}
