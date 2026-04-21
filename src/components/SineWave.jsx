import React, { useEffect, useRef } from 'react';

const SineWave = ({ active, color }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let phase = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      
      // Flat line if not active, wave if active
      const amplitude = active ? height * 0.35 : 1; 
      const frequency = 0.08;

      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * frequency + phase) * amplitude;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      if (active) {
         phase += 0.15;
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [active, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={40} 
      height={20} 
      style={{ 
        display: 'block', 
        opacity: active ? 1 : 0.4,
        transition: 'opacity 0.3s'
      }} 
    />
  );
};

export default SineWave;
