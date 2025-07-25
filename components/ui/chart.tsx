"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, Bar, BarChart, Area, AreaChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart-components"
import { cn } from "@/lib/utils"

// Define the props for the Chart component
interface ChartProps extends React.ComponentProps<typeof Card> {
  chartType: "line" | "bar" | "area"
  data: Record<string, any>[]
  config: ChartConfig
  className?: string
}

const Chart = React.forwardRef<HTMLDivElement, ChartProps>(
  ({ chartType, data, config, className, children, ...props }, ref) => {
    const chartProps = React.useMemo(() => {
      const chartConfig = config
      const chartData = data

      const colorMap = Object.keys(chartConfig).reduce(
        (acc, key) => {
          if (chartConfig[key].color) {
            acc[key] = chartConfig[key].color
          }
          return acc
        },
        {} as Record<string, string>,
      )

      const renderChart = () => {
        switch (chartType) {
          case "line":
            return (
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey={chartConfig.x.dataKey}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={chartConfig.x.tickFormatter}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={chartConfig.y.tickFormatter} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(chartConfig).map((key) => {
                  if (key === "x" || key === "y") return null
                  return (
                    <Line
                      key={key}
                      dataKey={chartConfig[key].dataKey}
                      stroke={chartConfig[key].color}
                      type="monotone"
                      dot={false}
                    />
                  )
                })}
              </LineChart>
            )
          case "bar":
            return (
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey={chartConfig.x.dataKey}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={chartConfig.x.tickFormatter}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={chartConfig.y.tickFormatter} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(chartConfig).map((key) => {
                  if (key === "x" || key === "y") return null
                  return <Bar key={key} dataKey={chartConfig[key].dataKey} fill={chartConfig[key].color} />
                })}
              </BarChart>
            )
          case "area":
            return (
              <AreaChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey={chartConfig.x.dataKey}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={chartConfig.x.tickFormatter}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={chartConfig.y.tickFormatter} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(chartConfig).map((key) => {
                  if (key === "x" || key === "y") return null
                  return (
                    <Area
                      key={key}
                      dataKey={chartConfig[key].dataKey}
                      fill={chartConfig[key].color}
                      stroke={chartConfig[key].color}
                      type="monotone"
                    />
                  )
                })}
              </AreaChart>
            )
          default:
            return null
        }
      }

      return {
        chartConfig,
        chartData,
        colorMap,
        renderChart,
      }
    }, [chartType, data, config])

    return (
      <Card ref={ref} className={cn("flex flex-col", className)} {...props}>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartProps.chartConfig} className="min-h-[200px]">
            {chartProps.renderChart()}
          </ChartContainer>
        </CardContent>
        {children}
      </Card>
    )
  },
)

Chart.displayName = "Chart"

export { Chart }
