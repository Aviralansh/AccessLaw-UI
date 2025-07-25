"use client"

import * as React from "react"
import type { ContentProps, NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"
import type { LegendProps } from "recharts/types/component/Legend"

import { cn } from "@/lib/utils"

// Use `Partial` to allow for custom properties on the config
export type ChartConfig = {
  [k: string]: {
    label?: string
    icon?: React.ComponentType<{ className?: string }>
    color?: string
  }
}

type ChartContextProps = {
  config: ChartConfig
  /**
   * The <ChartContainer /> component renders a chart from the `recharts` library.
   * This is a custom property that allows you to access the color of the chart.
   */
  color?: string
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

interface ChartContainerProps extends React.ComponentProps<"div"> {
  config: ChartConfig
  children: React.ReactNode
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ config, className, children, ...props }, ref) => {
    const [color, setColor] = React.useState<string>()

    return (
      <ChartContext.Provider value={{ config, color }}>
        <div
          ref={ref}
          className={cn("flex h-[350px] w-full flex-col items-center justify-center", className)}
          {...props}
        >
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, {
                // @ts-ignore
                setColor: setColor,
              })
            }
            return child
          })}
        </div>
      </ChartContext.Provider>
    )
  },
)
ChartContainer.displayName = "ChartContainer"

interface ChartTooltipProps extends ContentProps<ValueType, NameType> {
  hideLabel?: boolean
  hideIndicator?: boolean
  is(value: string): boolean
}

const ChartTooltip = React.forwardRef<HTMLDivElement, ChartTooltipProps>(
  ({ active, payload, hideLabel, hideIndicator, className, is, ...props }, ref) => {
    const { config } = useChart()

    if (!active || !payload?.length) {
      return null
    }

    const relevantPayload = payload.filter((item) => is(item.dataKey as string))

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
        {...props}
      >
        {!hideLabel && payload[0] ? <div className="text-muted-foreground">{payload[0].payload.name}</div> : null}
        {relevantPayload.map((item) => {
          if (!item.dataKey) return null
          const { color } = config[item.dataKey]

          return (
            <div key={item.dataKey} className="flex items-center justify-between gap-x-4">
              <div className="flex items-center gap-x-2">
                {hideIndicator ? null : <span className={cn("flex h-2 w-2 rounded-full", color && `bg-${color}`)} />}
                <span className="text-muted-foreground">{item.name || config[item.dataKey]?.label}</span>
              </div>
              <span className="font-mono font-medium text-foreground">{item.value}</span>
            </div>
          )
        })}
      </div>
    )
  },
)
ChartTooltip.displayName = "ChartTooltip"

interface ChartLegendProps extends LegendProps {
  is(value: string): boolean
}

const ChartLegend = React.forwardRef<HTMLDivElement, ChartLegendProps>(({ className, is, ...props }, ref) => {
  const { config } = useChart()

  return (
    <div ref={ref} className={cn("flex flex-wrap items-center justify-center gap-4", className)} {...props}>
      {Object.entries(config)
        .filter(([key]) => is(key))
        .map(([key, item]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 shrink-0 rounded-full", item.color && `bg-${item.color}`)} />
            {item.label}
          </div>
        ))}
    </div>
  )
})
ChartLegend.displayName = "ChartLegend"

export { ChartContainer, ChartTooltip, ChartLegend }
