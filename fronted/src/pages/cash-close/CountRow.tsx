import { Input } from '@/components/ui/input'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  label: string
  income: number
  outcome?: number
  expected: number
  counted: string
  onCounted: (v: string) => void
  diff: number
}

/** One payment-method row: real figures + counted input. */
export function CountRow({ id, label, income, outcome, expected, counted, onCounted, diff }: Props) {
  return (
    <tr className="h-14">
      <th scope="row" className="py-3 text-left font-medium">{label}</th>
      <td className="py-3">{formatPEN(income)}</td>
      {outcome !== undefined && <td className="py-3">{outcome > 0 ? '-' : ''}{formatPEN(outcome)}</td>}
      <td className="py-3 font-medium">{formatPEN(expected)}</td>
      <td className="py-3">
        <Input
          id={id}
          aria-label={`Monto contado ${label}`}
          type="number"
          step="0.01"
          min="0"
          value={counted}
          onChange={(e) => onCounted(e.target.value)}
          placeholder="0.00"
          className="h-8 w-28 px-2.5 py-1.5 text-xs font-semibold"
        />
      </td>
      <td className={cn('py-3 font-semibold', diff >= 0 ? 'text-success' : 'text-destructive')}>{formatPEN(diff)}</td>
    </tr>
  )
}
