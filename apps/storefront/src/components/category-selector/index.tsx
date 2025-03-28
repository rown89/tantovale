"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { ChevronRight, ChevronLeft, ChevronsUpDown } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

interface MobileCategorySelectorProps {
  categories: Category[];
  onSelect: (category: Category) => void;
  selectedCategoryControlled?: Omit<Category, "subcategories"> | null;
  className?: string;
  isLoading: boolean;
}

export function CategorySelector({
  categories,
  onSelect,
  selectedCategoryControlled,
  className,
  isLoading,
}: MobileCategorySelectorProps) {
  const [currentCategories, setCurrentCategories] = useState(categories);
  const [breadcrumbs, setBreadcrumbs] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Omit<
    Category,
    "subcategories"
  > | null>(selectedCategoryControlled || null);
  const [isOpen, setIsOpen] = useState(false);

  const handleCategoryClick = (category: Category) => {
    if (category.subcategories.length > 0) {
      setCurrentCategories(category.subcategories);
      setBreadcrumbs([...breadcrumbs, category]);
    } else {
      setSelectedCategory(category);
      onSelect(category);
      setIsOpen(false);
    }
  };

  const handleBackClick = () => {
    if (breadcrumbs.length > 0) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      setCurrentCategories(
        newBreadcrumbs.length === 0
          ? categories
          : newBreadcrumbs[newBreadcrumbs.length - 1]?.subcategories || [],
      );
    }
  };

  useEffect(() => {
    setCurrentCategories(categories);
  }, [categories]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          autoFocus
          variant="outline"
          className={cn("w-full justify-between", className)}
        >
          {selectedCategory ? selectedCategory.name : "Select a category"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-full min-w-[300px]" align="start">
        {isLoading ? (
          "--"
        ) : (
          <div className="flex flex-col space-y-2 p-2">
            {breadcrumbs.length > 0 && (
              <Button
                variant="ghost"
                onClick={handleBackClick}
                className="w-full justify-start"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to {breadcrumbs[breadcrumbs.length - 1]?.name}
              </Button>
            )}

            <div className="flex items-center text-sm text-muted-foreground px-2">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb.id}-${crumb.name}`}>
                  <span>{crumb.name}</span>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight className="mx-1 h-4 w-4" />
                  )}
                </React.Fragment>
              ))}
            </div>

            <ScrollArea className="rounded-md">
              <div className="p-2">
                {currentCategories?.length > 0 &&
                  currentCategories?.map((category) => (
                    <Button
                      key={`${category.id}-${category.name}`}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start mb-1",
                        selectedCategory?.id === category.id && "bg-muted",
                      )}
                      onClick={() => handleCategoryClick(category)}
                    >
                      {category.name}
                      {category.subcategories.length > 0 && (
                        <ChevronRight className="ml-auto h-4 w-4" />
                      )}
                    </Button>
                  ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
