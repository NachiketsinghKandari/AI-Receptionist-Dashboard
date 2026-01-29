'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

      {/* Mobile: Floating Action Button + Drawer */}
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
            aria-label="Open filters"
          >
            <SlidersHorizontal className="h-6 w-6" />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <FilterSidebar
              {...props}
              className="w-full border-none bg-transparent"
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
