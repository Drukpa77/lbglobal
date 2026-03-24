"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = [
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
];

type ChartItem = {
  label: string;
  value: number;
};

type Props = {
  byCountry: ChartItem[];
  byCourse: ChartItem[];
  funnel: ChartItem[];
};

function BarChartLegend({ data }: { data: ChartItem[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {data.map((item, index) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-sm"
            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
          />
          <span className="text-xs text-slate-600">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminAnalyticsCharts({ byCountry, byCourse, funnel }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Applications by Country</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCountry}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#cbd5e1" />
              <YAxis allowDecimals={false} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: "0.5rem",
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="value">
                {byCountry.map((_, index) => (
                  <Cell key={`country-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <BarChartLegend data={byCountry} />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Popular Courses</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCourse}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#cbd5e1" />
              <YAxis allowDecimals={false} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: "0.5rem",
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="value">
                {byCourse.map((_, index) => (
                  <Cell key={`course-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <BarChartLegend data={byCourse} />
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="text-sm font-semibold">Application Funnel</h2>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={funnel} dataKey="value" nameKey="label" outerRadius={110}>
                {funnel.map((_, index) => (
                  <Cell key={`funnel-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: "0.5rem",
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#e2e8f0" }}
              />
              <Legend
                wrapperStyle={{ color: "#64748b" }}
                formatter={(value) => <span className="text-slate-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
