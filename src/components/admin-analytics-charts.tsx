"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartItem = {
  label: string;
  value: number;
};

type Props = {
  byCountry: ChartItem[];
  byCourse: ChartItem[];
  funnel: ChartItem[];
};

export function AdminAnalyticsCharts({ byCountry, byCourse, funnel }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Applications by Country</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCountry}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Popular Courses</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCourse}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#0d9488" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="text-sm font-semibold">Application Funnel</h2>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={funnel} dataKey="value" nameKey="label" outerRadius={110} fill="#111827" />
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
