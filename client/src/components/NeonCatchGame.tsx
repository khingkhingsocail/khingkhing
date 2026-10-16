import { useEffect, useRef, useState } from "react";
import { Gamepad2, RotateCcw, Zap } from "lucide-react";

const ROUND_SECONDS = 20;

export default function NeonCatchGame() {
  const [phase, setPhase] = useState<"ready" | "playing" | "finished">("ready");
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [score, setScore] = useState(0);
  const [position, setPosition] = useState({ x: 51, y: 48 });
  const targetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase === "playing") targetRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;

    let elapsed = 0;
    const clock = window.setInterval(() => {
      elapsed += 1;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(clock);
        setPhase("finished");
      }
    }, 1000);
    const movement = window.setInterval(() => {
      setPosition({ x: 9 + Math.random() * 78, y: 13 + Math.random() * 69 });
    }, 1050);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(movement);
    };
  }, [phase]);

  function startGame() {
    setScore(0);
    setTimeLeft(ROUND_SECONDS);
    setPosition({ x: 51, y: 48 });
    setPhase("playing");
  }

  function catchLight() {
    if (phase !== "playing") return;
    setScore((current) => current + 1);
    setPosition({ x: 9 + Math.random() * 78, y: 13 + Math.random() * 69 });
  }

  return (
    <div className="game-layout">
      <div className="game-description">
        <p className="eyebrow">MINI GAME · 20 SECOND ROUND</p>
        <h3>Neon<br /><span>catch.</span></h3>
        <p className="game-description__body">แสงกำลังจะหนีไป กดจับวงกลมสีมะนาวให้ได้มากที่สุดก่อนหมดเวลา</p>
        <div className="game-hint"><span className="keycap">SPACE</span><span>หรือแตะ / คลิกที่จุดแสง</span></div>
        <div className="game-best">
          <span><Zap size={15} /> เก็บแสงให้ทัน</span>
          <span>PLAY ANYTIME</span>
        </div>
      </div>

      <div className="game-console">
        <div className="game-console__top">
          <span><Gamepad2 size={15} /> PLAY AREA <span className="game-live"><i /> LIVE</span></span>
          <span className="game-console__id">PF–001 / NEON CATCH</span>
        </div>
        <div className={`game-arena ${phase === "playing" ? "game-arena--active" : ""}`}>
          <div className="arena-grid" aria-hidden="true" />
          <div className="arena-stars" aria-hidden="true">✳　·　✦　　·　✳　　·　✦　·</div>
          <div className="arena-score" aria-live="polite">
            <span>SCORE <strong>{score.toString().padStart(2, "0")}</strong></span>
            <span>TIME <strong>{timeLeft.toString().padStart(2, "0")}<small>s</small></strong></span>
          </div>

          {phase === "playing" ? (
            <button
              ref={targetRef}
              type="button"
              className="light-target"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              onClick={catchLight}
              aria-label="จับจุดแสง เพิ่มคะแนน"
            ><span /><span className="visually-hidden">จับแสง</span></button>
          ) : null}

          {phase !== "playing" ? (
            <div className="game-overlay">
              <span className="game-overlay__mark">{phase === "finished" ? <Zap size={23} /> : <Gamepad2 size={23} />}</span>
              <p className="eyebrow">{phase === "finished" ? "ROUND COMPLETE" : "READY WHEN YOU ARE"}</p>
              <h4>{phase === "finished" ? `จับแสงได้ ${score} ครั้ง` : "พร้อมหรือยัง?"}</h4>
              <p>{phase === "finished" ? "ลองอีกครั้ง แล้วทำคะแนนให้ดีกว่าเดิม" : "จับจุดแสงให้ได้มากที่สุดใน 20 วินาที"}</p>
              <button className="button button--lime game-start" type="button" onClick={startGame}>
                {phase === "finished" ? <RotateCcw size={16} /> : <Zap size={16} />}
                {phase === "finished" ? "เริ่มใหม่" : "เริ่มเล่น"}
              </button>
            </div>
          ) : null}

          <div className="arena-corner arena-corner--tl" aria-hidden="true" />
          <div className="arena-corner arena-corner--br" aria-hidden="true" />
        </div>
        <div className="game-console__bottom"><span>HIT THE LIGHT · BUILD YOUR SCORE</span><span>{phase === "playing" ? "GO GO GO" : "SPACE TO PLAY"}</span></div>
      </div>
    </div>
  );
}
