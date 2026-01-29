'use client';

import { SlidersHorizontal } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { FilterSidebar, type FilterSidebarProps } from './filter-sidebar';

type ResponsiveFilterSidebarProps = FilterSidebarProps;

export function ResponsiveFilterSidebar(props: ResponsiveFilterSidebarProps) {
  return (
    <>
      {/* Desktop: Standard sidebar - hidden on mobile */}
      <FilterSidebar {...props} className="hidden md:flex" />

      {/* Mobile: Centered bottom frosted glass tab + Drawer */}
      <Drawer>
        <DrawerTrigger asChild>
          <button
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 dark:from-white/80 dark:via-gray-100/80 dark:to-white/80 backdrop-blur-xl border border-white/30 dark:border-black/20 shadow-[0_4px_20px_rgba(0,0,0,0.4)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:hidden text-white dark:text-gray-900 font-medium ring-1 ring-white/10 dark:ring-black/10"
            aria-label="Open filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-sm">Filters</span>
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <FilterSidebar
              {...props}
              hideHeader
              className="w-full border-none bg-transparent"
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
