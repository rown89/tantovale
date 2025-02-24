"use client";

import { client } from "@/lib/api";
import { useRouter } from "next/navigation";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export interface User {
  id: number;
  username: string;
  email_verified: boolean;
  phone_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  loadingUser: boolean;
  logout: VoidFunction;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    async function initializeAuth() {
      // Try to fetch current user info.
      const res = await client.verify.$get({
        credentials: "include",
      });

      if (res.ok) {
        // User is logged in.
        const data = await res.json();
        setUser(data.user);
      } else {
        // User is not logged in;
        setUser(null);
      }
      setLoadingUser(false);
    }
    initializeAuth();
  }, []);

  function logout() {
    router.push("/api/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loadingUser, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
