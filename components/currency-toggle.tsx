"use client"

import { Check, ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useState } from "react"

const currencies = [
  { value: "usd", label: "USD", symbol: "$" },
  { value: "eur", label: "EUR", symbol: "€" },
  { value: "gbp", label: "GBP", symbol: "£" },
  { value: "jpy", label: "JPY", symbol: "¥" },
]

interface CurrencyToggleProps {
  currency: string
  setCurrency: (currency: string) => void
}

export function CurrencyToggle({ currency, setCurrency }: CurrencyToggleProps) {
  const [open, setOpen] = useState(false)

  const selectedCurrency = currencies.find((c) => c.value === currency) || currencies[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[120px] justify-between">
          {selectedCurrency.symbol} {selectedCurrency.label}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[120px] p-0">
        <Command>
          <CommandInput placeholder="Search currency..." />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {currencies.map((c) => (
                <CommandItem
                  key={c.value}
                  value={c.value}
                  onSelect={(currentValue) => {
                    setCurrency(currentValue)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", currency === c.value ? "opacity-100" : "opacity-0")} />
                  {c.symbol} {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
