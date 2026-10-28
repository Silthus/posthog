// PROTOTYPE, never merged: Silthus/personal#212. One list for broadcasts, transactional emails, workflows and
// templates: the same columns, the same filter bar, the same empty state.
import { useValues } from 'kea'
import { router } from 'kea-router'
import { ReactNode, useEffect, useState } from 'react'

import { IconChevronDown, IconSearch, IconX } from '@posthog/icons'
import {
    Badge,
    Button,
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Text,
    cn,
} from '@posthog/quill'

import { MessagingListColumns, MessagingRow } from './prototypeData'

type BadgeVariant = 'default' | 'info' | 'destructive' | 'warning' | 'success' | 'completed'

const STATUS_BADGE: Record<string, BadgeVariant> = {
    Draft: 'default',
    Scheduled: 'info',
    Sent: 'completed',
    Live: 'success',
    Paused: 'warning',
    Marketing: 'default',
    Transactional: 'info',
}

/** Columns a narrow scene drops, so the list never scrolls sideways. */
const WIDE_ONLY = 'hidden @min-[48rem]/main-content:table-cell'

const ANY = 'any'

function distinct(values: string[]): string[] {
    return [...new Set(values)].sort()
}

function rowMatches(row: MessagingRow, search: string): boolean {
    const query = search.trim().toLowerCase()
    return !query || [row.name, row.detail, ...row.tags].some((value) => value.toLowerCase().includes(query))
}

function FilterMenu({
    label,
    value,
    active,
    children,
}: {
    label: string
    value: string
    active: boolean
    children: ReactNode
}): JSX.Element {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button variant="outline" size="sm" className={cn(active && 'border-primary text-foreground')} />
                }
            >
                {label}: {value}
                <IconChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">{children}</DropdownMenuContent>
        </DropdownMenu>
    )
}

export interface MessagingListProps {
    rows: MessagingRow[]
    columns: MessagingListColumns
    /** Wraps a row's name, for example in a hover preview. */
    renderName?: (row: MessagingRow, name: JSX.Element) => JSX.Element
    /** Controls that sit at the end of the filter bar, like the Workflows page's type filter. */
    extraFilters?: ReactNode
}

export function MessagingList({ rows, columns, renderName, extraFilters }: MessagingListProps): JSX.Element {
    const { searchParams } = useValues(router)
    const [search, setSearch] = useState<string>(searchParams.search ?? '')
    const [status, setStatus] = useState<string>(ANY)
    const [tags, setTags] = useState<string[]>([])
    const [owner, setOwner] = useState<string>(ANY)
    useEffect(() => setSearch(searchParams.search ?? ''), [searchParams.search])

    const filtersOn = !!search || status !== ANY || tags.length > 0 || owner !== ANY
    const shown = rows.filter(
        (row) =>
            rowMatches(row, search) &&
            (status === ANY || row.status === status) &&
            tags.every((tag) => row.tags.includes(tag)) &&
            (owner === ANY || row.owner === owner)
    )
    const clear = (): void => {
        setSearch('')
        setStatus(ANY)
        setTags([])
        setOwner(ANY)
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <InputGroup className="w-full @min-[40rem]/main-content:w-64">
                    <InputGroupAddon>
                        <IconSearch />
                    </InputGroupAddon>
                    <InputGroupInput
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={`Search ${columns.noun}…`}
                        aria-label={`Search ${columns.noun}`}
                    />
                </InputGroup>
                <FilterMenu label={columns.statusLabel} value={status === ANY ? 'Any' : status} active={status !== ANY}>
                    <DropdownMenuRadioGroup value={status} onValueChange={(value) => setStatus(value as string)}>
                        <DropdownMenuRadioItem value={ANY}>Any</DropdownMenuRadioItem>
                        {distinct(rows.map((row) => row.status)).map((value) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                                {value}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </FilterMenu>
                <FilterMenu label="Tags" value={tags.length === 0 ? 'Any' : tags.join(', ')} active={tags.length > 0}>
                    {distinct(rows.flatMap((row) => row.tags)).map((tag) => (
                        <DropdownMenuCheckboxItem
                            key={tag}
                            checked={tags.includes(tag)}
                            onCheckedChange={(checked) =>
                                setTags(checked ? [...tags, tag] : tags.filter((value) => value !== tag))
                            }
                        >
                            {tag}
                        </DropdownMenuCheckboxItem>
                    ))}
                </FilterMenu>
                <FilterMenu label="Created by" value={owner === ANY ? 'Anyone' : owner} active={owner !== ANY}>
                    <DropdownMenuRadioGroup value={owner} onValueChange={(value) => setOwner(value as string)}>
                        <DropdownMenuRadioItem value={ANY}>Anyone</DropdownMenuRadioItem>
                        {distinct(rows.map((row) => row.owner)).map((value) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                                {value}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </FilterMenu>
                {extraFilters}
                {filtersOn && (
                    <Button size="sm" onClick={clear}>
                        <IconX />
                        Clear filters
                    </Button>
                )}
            </div>
            {shown.length === 0 ? (
                <Empty className="rounded-md border border-dashed border-border py-8">
                    <EmptyHeader>
                        <EmptyTitle>No {columns.noun} match these filters</EmptyTitle>
                        <EmptyDescription>Change the search or the filters to see more.</EmptyDescription>
                    </EmptyHeader>
                    <Button variant="outline" onClick={clear}>
                        Clear filters
                    </Button>
                </Empty>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>{columns.statusLabel}</TableHead>
                            <TableHead className={WIDE_ONLY}>Tags</TableHead>
                            <TableHead>{columns.factLabel}</TableHead>
                            <TableHead className={cn(WIDE_ONLY, 'text-right')}>{columns.metricLabel}</TableHead>
                            <TableHead className={WIDE_ONLY}>Created by</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shown.map((row) => {
                            const name = (
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate font-semibold">{row.name}</span>
                                    <Text
                                        size="xs"
                                        variant="muted"
                                        className={cn('m-0 truncate', row.detailIsCode && 'font-mono')}
                                    >
                                        {row.detail}
                                    </Text>
                                </span>
                            )
                            return (
                                <TableRow key={row.id}>
                                    <TableCell className="max-w-72">
                                        {renderName ? renderName(row, name) : name}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_BADGE[row.status] ?? 'default'}>{row.status}</Badge>
                                    </TableCell>
                                    <TableCell className={WIDE_ONLY}>
                                        <span className="flex flex-wrap gap-1">
                                            {row.tags.map((tag) => (
                                                <Badge key={tag} variant="default">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </span>
                                    </TableCell>
                                    <TableCell>{row.fact}</TableCell>
                                    <TableCell className={cn(WIDE_ONLY, 'text-right')}>{row.metric}</TableCell>
                                    <TableCell className={WIDE_ONLY}>{row.owner}</TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}
