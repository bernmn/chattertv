import React, { useState } from "react";
import { Link } from "wouter";
import { useModal } from "@/contexts/modal-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Upload, Menu, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Navbar: React.FC = () => {
  const { uploadModal } = useModal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <nav className="bg-black bg-opacity-95 fixed w-full z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-24">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/">
                <img src="/logo.svg" alt="ChatterTV" className="h-16" />
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link href="/">
                  <span className="text-white px-3 py-2 rounded-md text-sm font-medium cursor-pointer">Home</span>
                </Link>
                <Link href="/recent">
                  <span className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium cursor-pointer">Recent</span>
                </Link>
                <Link href="/featured">
                  <span className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium cursor-pointer">Featured</span>
                </Link>
                <Link href="/contests">
                  <span className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium cursor-pointer">Contests</span>
                </Link>
                <Link href="/ai-videos">
                  <span className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium cursor-pointer">AI Videos</span>
                </Link>
              </div>
            </div>
          </div>
          
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search videos..."
                  className="bg-[#333333] text-white px-4 py-2 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#6A5ACD]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                >
                  <Search className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
              
              <Button 
                variant="default" 
                className="ml-4 bg-[#6A5ACD] text-white hover:bg-opacity-90 transition duration-300 rounded-full"
                onClick={uploadModal.openModal}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
              
              <div className="ml-4 relative">
                <button className="flex items-center focus:outline-none">
                  <img className="h-8 w-8 rounded-full" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="User avatar" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="-mr-2 flex md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              className="bg-[#333333] inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
            >
              {mobileMenuOpen ? (
                <X className="block h-6 w-6" />
              ) : (
                <Menu className="block h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className={`${mobileMenuOpen ? 'block' : 'hidden'} md:hidden`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          <Link href="/">
            <span className="text-white block px-3 py-2 rounded-md text-base font-medium cursor-pointer">Home</span>
          </Link>
          <Link href="/recent">
            <span className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium cursor-pointer">Recent</span>
          </Link>
          <Link href="/featured">
            <span className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium cursor-pointer">Featured</span>
          </Link>
          <Link href="/contests">
            <span className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium cursor-pointer">Contests</span>
          </Link>
          <Link href="/ai-videos">
            <span className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium cursor-pointer">AI Videos</span>
          </Link>
        </div>
        <div className="pt-4 pb-3 border-t border-gray-700">
          <div className="flex items-center px-5">
            <div className="flex-shrink-0">
              <img className="h-10 w-10 rounded-full" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="User avatar" />
            </div>
            <div className="ml-3">
              <div className="text-base font-medium text-white">Demo User</div>
              <div className="text-sm font-medium text-gray-400">demo@chattertv.com</div>
            </div>
          </div>
          <div className="mt-3 px-2 space-y-2">
            <Button 
              className="w-full bg-[#6A5ACD] text-white hover:bg-opacity-90"
              onClick={() => {
                uploadModal.openModal();
                setMobileMenuOpen(false);
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Video
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
