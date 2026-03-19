type FilterItem = {
  id: string
  label: string
}

type FilterListProps = {
  title?: string
  items: FilterItem[]
  onSelect?: (id: string) => void
  selectedId?: string
}

export default function FilterList({
  title = '筛选',
  items,
  onSelect,
  selectedId,
}: FilterListProps) {
  return (
    <div className="w-full">
      {title && (
        <p className="text-xs font-medium text-[#99a1af] mb-3">
          {title}
        </p>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect?.(item.id)}
            className={`w-full text-left text-sm font-normal leading-5 px-0 py-2 transition-colors duration-200 ${
              selectedId === item.id
                ? 'text-primary-500'
                : 'text-[#4a5565] hover:text-[#101828]'
            }`}
          >
            # {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
