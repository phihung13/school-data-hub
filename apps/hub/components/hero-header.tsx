// Hero cong — header navy gradient + glow vàng, đáy vòm trắng (DESIGN-GUIDELINES §6).
export function HeroHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light pb-[54px]">
      <div
        aria-hidden="true"
        className="absolute -right-11 -top-[72px] h-[190px] w-[190px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 36% 36%, rgba(255,198,41,.55), rgba(255,198,41,.06) 72%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function HeroArch() {
  return (
    <div
      className="relative -mt-8 h-8 rounded-t-[100%] bg-pagebg"
      aria-hidden="true"
    />
  );
}
