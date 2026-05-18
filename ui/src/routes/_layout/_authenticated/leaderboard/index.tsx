import {
  ActivityLeaderboardQuerySchema,
  Platform,
  SUPPORTED_PLATFORMS,
  TimePeriod,
} from "@crosspost/plugin/types";
import { getErrorMessage } from "@crosspost/sdk";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/back-button";
import { InlineBadges } from "@/components/badges/inline-badges";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchLeaderboard } from "@/lib/api/leaderboard";
import { type ExportField, type ExportFormat, exportData } from "@/lib/utils/export-utils";

type LeaderboardEntry = {
  rank?: number;
  signerId: string;
  totalScore?: number;
  totalPosts?: number;
  totalReplies?: number;
  totalQuotes?: number;
  firstPostTimestamp?: string | number;
  lastActive?: string | number;
  postCount?: number;
  lastPostTimestamp?: string | number;
};

export const Route = createFileRoute("/_layout/_authenticated/leaderboard/")({
  component: LeaderboardPage,
  validateSearch: (search) => ActivityLeaderboardQuerySchema.parse(search),
});

const fetchAllLeaderboardData = async ({
  timeframe,
  platforms,
  startDate,
  endDate,
}: {
  timeframe: TimePeriod;
  platforms?: string[];
  startDate?: string;
  endDate?: string;
}) => {
  const allEntries: LeaderboardEntry[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const normalized = await fetchLeaderboard({
      limit,
      offset,
      timeframe,
      startDate,
      endDate,
      platforms: platforms?.length ? platforms : undefined,
    });
    const entries = normalized.entries as unknown as LeaderboardEntry[];
    allEntries.push(...entries);

    hasMore = entries.length === limit;
    offset += limit;
  }

  return allEntries;
};

function LeaderboardPage() {
  const search = useSearch({ from: Route.id });
  const { timeframe, platforms, startDate, endDate } = search;
  const navigate = useNavigate({ from: Route.fullPath });

  const parsedStartDate = startDate ? new Date(startDate) : undefined;
  const parsedEndDate = endDate ? new Date(endDate) : undefined;

  // Validate custom date range
  const isValidDateRange =
    timeframe !== TimePeriod.CUSTOM ||
    (parsedStartDate && parsedEndDate && parsedStartDate <= parsedEndDate);

  const [sorting, setSorting] = useState<SortingState>([{ id: "rank", desc: false }]);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [timeframe, startDate, endDate, platforms?.join(",")]);

  const {
    data: queryResult,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "leaderboard",
      pagination.pageIndex,
      pagination.pageSize,
      timeframe,
      startDate,
      endDate,
      platforms,
    ],
    queryFn: async () => {
      const result = await fetchLeaderboard({
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
        timeframe: timeframe ?? TimePeriod.ALL,
        startDate,
        endDate,
        platforms,
      });
      return result;
    },
    enabled: isValidDateRange, // Only run query if date range is valid
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Extract data and metadata from query result
  const data = Array.isArray(queryResult?.entries) ? queryResult.entries : [];
  const totalEntries = queryResult?.meta?.pagination?.total || 0;

  // Export fields configuration
  const exportFields: ExportField<LeaderboardEntry>[] = [
    { key: "rank", header: "Rank" },
    { key: "signerId", header: "NEAR Account" },
    { key: "totalScore", header: "Score" },
    { key: "totalPosts", header: "Posts" },
    { key: "totalReplies", header: "Replies" },
    { key: "totalQuotes", header: "Quotes" },
    {
      key: "firstPostTimestamp",
      header: "First Post",
      formatter: (value) => {
        if (!value) return "N/A";
        try {
          const date = new Date(value);
          return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleString();
        } catch {
          return "Invalid Date";
        }
      },
    },
    {
      key: "lastActive",
      header: "Last Active",
      formatter: (value) => {
        if (!value) return "N/A";
        try {
          const date = new Date(value);
          return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleString();
        } catch {
          return "Invalid Date";
        }
      },
    },
  ];

  const handleExport = async (format: ExportFormat) => {
    try {
      const allData = await fetchAllLeaderboardData({
        timeframe: timeframe ?? TimePeriod.ALL,
        platforms,
        startDate,
        endDate,
      });

      if (!Array.isArray(allData) || allData.length === 0) {
        alert("No data to export");
        return;
      }

      const timeframeName = timeframe ? timeframe.toLowerCase().replace("_", "-") : "all-time";
      const filename = `leaderboard-${timeframeName}`;

      exportData(allData, exportFields, filename, format);
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const columnHelper = createColumnHelper<LeaderboardEntry>();
  const columns = [
    columnHelper.accessor("rank", {
      header: "Rank",
      cell: (info) => <div className="w-[20px]">{info.getValue()}</div>,
    }),
    columnHelper.accessor("signerId", {
      header: "NEAR Account",
      cell: (info) => {
        const accountId = info.getValue();
        return (
          <div className="flex items-center gap-2 w-[180px]">
            <Link
              to={`/profile/$accountId`}
              params={{ accountId }}
              className="text-primary hover:underline transition-colors block truncate"
            >
              {accountId}
            </Link>
            <InlineBadges accountId={accountId} />
          </div>
        );
      },
    }),
    columnHelper.accessor("totalScore", {
      header: "Score",
      cell: (info) => <div className="font-semibold">{info.getValue()}</div>,
    }),
    columnHelper.accessor("totalPosts", {
      header: "Posts",
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor("totalReplies", {
      header: "Replies",
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor("totalQuotes", {
      header: "Quotes",
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor((row) => (row as any).firstPostTimestamp, {
      id: "firstPostTimestamp",
      header: "First Post",
      cell: (info) => {
        const timestamp = info.getValue();
        if (!timestamp) return "N/A";
        try {
          const date = new Date(timestamp);
          if (isNaN(date.getTime())) return "Invalid Date";
          return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch (e) {
          console.error("Error parsing first post date:", timestamp, e);
          return "Invalid Date";
        }
      },
    }),
    columnHelper.accessor("lastActive", {
      header: "Last Active",
      cell: (info) => {
        const dateTimeString = info.getValue();
        if (!dateTimeString) return "N/A";
        try {
          const date = new Date(dateTimeString);
          if (isNaN(date.getTime())) return "Invalid Date";
          return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch (e) {
          console.error("Error parsing last active date:", dateTimeString, e);
          return "Invalid Date";
        }
      },
    }),
  ];

  // Initialize TanStack Table
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true, // Keep manual pagination
    // pageCount is derived from totalEntries fetched from API
    pageCount: totalEntries > 0 ? Math.ceil(totalEntries / pagination.pageSize) : -1, // Use -1 or 0 if total unknown initially
    // Alternatively, if totalEntries is 0 initially: pageCount: Math.max(1, Math.ceil(totalEntries / pagination.pageSize))
  });

  const platformFilterValue =
    platforms?.length === 1 && platforms[0] ? platforms[0] : "all";

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4 mb-6">
        <BackButton />
        <div className="flex flex-wrap gap-4 items-end">
          {timeframe === TimePeriod.CUSTOM && (
            <>
              <div>
                <Label className="block text-sm font-medium mb-1">Start Date</Label>
                <DatePicker
                  date={parsedStartDate}
                  onDateChange={(date) => {
                    const dateString = date ? date.toISOString() : undefined;
                    navigate({
                      search: (prev: unknown) => ({
                        ...(prev as Record<string, unknown>),
                        startDate: dateString,
                      }),
                      replace: true,
                    });
                  }}
                  placeholder="Select start date and time"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium mb-1">End Date</Label>
                <DatePicker
                  date={parsedEndDate}
                  onDateChange={(date) => {
                    const dateString = date ? date.toISOString() : undefined;
                    navigate({
                      search: (prev: unknown) => ({
                        ...(prev as Record<string, unknown>),
                        endDate: dateString,
                      }),
                      replace: true,
                    });
                  }}
                  placeholder="Select end date and time"
                  disabled={!parsedStartDate}
                />
              </div>
            </>
          )}
          <div>
            <Label className="block text-sm font-medium mb-1">Time Period</Label>
            <Select
              value={timeframe ?? TimePeriod.ALL}
              onValueChange={(v) => {
                const newSearch: Record<string, unknown> = {
                  ...search,
                  timeframe: (v as TimePeriod) || undefined,
                };

                if (v !== TimePeriod.CUSTOM) {
                  delete newSearch.startDate;
                  delete newSearch.endDate;
                }

                navigate({
                  search: newSearch,
                  replace: true,
                });
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TimePeriod.DAY}>Last 24 Hours</SelectItem>
                <SelectItem value={TimePeriod.WEEK}>Last Week</SelectItem>
                <SelectItem value={TimePeriod.MONTH}>Last Month</SelectItem>
                <SelectItem value={TimePeriod.YEAR}>Last Year</SelectItem>
                <SelectItem value={TimePeriod.ALL}>All Time</SelectItem>
                <SelectItem value={TimePeriod.CUSTOM}>Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block text-sm font-medium mb-1">Platform</Label>
            <Select
              value={platformFilterValue}
              onValueChange={(v) => {
                navigate({
                  search: {
                    ...search,
                    platforms: v === "all" ? undefined : [v],
                  },
                  replace: true,
                });
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {SUPPORTED_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === Platform.TWITTER ? "Twitter" : "Farcaster"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive mb-4">
          {getErrorMessage(error, "Failed to fetch leaderboard data")}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading leaderboard data...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto base-component rounded-lg relative border border-border">
            {isFetching && !isLoading && (
              <div className="absolute top-2 right-2 z-10">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary" />
              </div>
            )}
            <Table className="min-w-full">
              <TableHeader className="bg-muted/50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" ? (
                            <span>▲</span>
                          ) : header.column.getIsSorted() === "desc" ? (
                            <span>▼</span>
                          ) : null}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="bg-background divide-y divide-border">
                {table.getRowModel()?.rows?.length > 0 ? (
                  table.getRowModel()?.rows?.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      {row.getVisibleCells()?.map((cell) => (
                        <TableCell key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm ">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="px-6 py-4 text-center text-sm text-muted-foreground"
                    >
                      No data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="px-3 py-1 disabled:opacity-50"
              >
                {"<<"}
              </Button>
              <Button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-3 py-1 disabled:opacity-50"
              >
                {"<"}
              </Button>
              <Button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-3 py-1 disabled:opacity-50"
              >
                {">"}
              </Button>
              <Button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="px-3 py-1 disabled:opacity-50"
              >
                {">>"}
              </Button>
              {/* Export Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>Export Data</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")}>
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <div>
                <Label className="text-sm font-medium mb-1 block">
                  Page{" "}
                  <strong>
                    {table.getState().pagination.pageIndex + 1} of{" "}
                    {/* Use table.getPageCount() which relies on totalEntries */}
                    {table.getPageCount() > 0 ? table.getPageCount() : 1}
                  </strong>
                </Label>
                <Select
                  value={table.getState().pagination.pageSize.toString()}
                  onValueChange={(value) => {
                    table.setPageSize(Number(value));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select page size" />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((pageSize) => (
                      <SelectItem key={pageSize} value={pageSize.toString()}>
                        Show {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
