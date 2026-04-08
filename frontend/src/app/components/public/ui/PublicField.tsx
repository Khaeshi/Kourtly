import React from 'react';

interface PublicFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export function PublicField({ label, hint, children }: PublicFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[0.62rem] tracking-widest uppercase text-white/30">{label}</label>
      {children}
      {hint ? <p className="text-[0.68rem] text-white/25">{hint}</p> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function PublicInput({ className = '', ...props }: InputProps) {
  return <input className={`public-input ${className}`} {...props} />;
}

export function PublicTextarea({ className = '', ...props }: TextAreaProps) {
  return <textarea className={`public-input resize-none ${className}`} {...props} />;
}

export function PublicSelect({ className = '', children, ...props }: SelectProps) {
  return (
    <select className={`public-input ${className}`} {...props}>
      {children}
    </select>
  );
}
