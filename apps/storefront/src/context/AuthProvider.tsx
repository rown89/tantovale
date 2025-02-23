"use client";

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

export const AuthProvider = ({
  children,
  access_token,
}: {
  children: ReactNode;
  access_token?: string;
}) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // On mount, load the session.
  useEffect(() => {
    if (access_token) {
      // console.log("fetchSession");
      // fetchSession();
    }
  }, [access_token]);

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
