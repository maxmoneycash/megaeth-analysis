/**
 * Mobile-friendly toolbar with touch buttons
 * Floats at bottom of screen
 */

export interface ToolbarButton {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
}

interface ButtonHitBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Toolbar {
  private buttons: ToolbarButton[] = [];
  private hitBoxes: ButtonHitBox[] = [];
  private hoveredButton: string | null = null;
  private activeButton: string | null = null;

  private readonly BUTTON_SIZE = 56;
  private readonly BUTTON_SPACING = 12;
  private readonly PADDING = 16;
  private readonly TOOLBAR_HEIGHT = 72;

  addButton(button: ToolbarButton): void {
    this.buttons.push(button);
  }

  setActiveButton(id: string | null): void {
    this.activeButton = id;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.buttons.length === 0) return;

    this.hitBoxes = [];

    // Calculate toolbar dimensions
    const totalButtonWidth =
      this.buttons.length * this.BUTTON_SIZE +
      (this.buttons.length - 1) * this.BUTTON_SPACING;
    const toolbarWidth = totalButtonWidth + this.PADDING * 2;
    const toolbarX = (width - toolbarWidth) / 2;
    const toolbarY = height - this.TOOLBAR_HEIGHT - this.PADDING;

    // Draw toolbar background (pill shape)
    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
    this.roundRect(ctx, toolbarX, toolbarY, toolbarWidth, this.TOOLBAR_HEIGHT, 36);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0, 217, 165, 0.3)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, toolbarX, toolbarY, toolbarWidth, this.TOOLBAR_HEIGHT, 36);
    ctx.stroke();

    // Draw buttons
    let buttonX = toolbarX + this.PADDING;
    const buttonY = toolbarY + (this.TOOLBAR_HEIGHT - this.BUTTON_SIZE) / 2;

    for (const button of this.buttons) {
      const isHovered = this.hoveredButton === button.id;
      const isActive = this.activeButton === button.id;

      // Store hit box
      this.hitBoxes.push({
        id: button.id,
        x: buttonX,
        y: buttonY,
        width: this.BUTTON_SIZE,
        height: this.BUTTON_SIZE,
      });

      // Button background
      if (isActive) {
        ctx.fillStyle = '#00D9A5';
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(0, 217, 165, 0.3)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      }
      this.roundRect(ctx, buttonX, buttonY, this.BUTTON_SIZE, this.BUTTON_SIZE, 16);
      ctx.fill();

      // Icon
      ctx.fillStyle = isActive ? '#000' : '#fff';
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        button.icon,
        buttonX + this.BUTTON_SIZE / 2,
        buttonY + this.BUTTON_SIZE / 2
      );

      buttonX += this.BUTTON_SIZE + this.BUTTON_SPACING;
    }
  }

  handleMouseMove(mx: number, my: number): boolean {
    let newHovered: string | null = null;

    for (const hitBox of this.hitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        newHovered = hitBox.id;
        break;
      }
    }

    if (newHovered !== this.hoveredButton) {
      this.hoveredButton = newHovered;
      return true;
    }
    return false;
  }

  handleClick(mx: number, my: number): boolean {
    for (const hitBox of this.hitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        const button = this.buttons.find((b) => b.id === hitBox.id);
        if (button) {
          button.onClick();
          return true;
        }
      }
    }
    return false;
  }

  containsPoint(mx: number, my: number): boolean {
    for (const hitBox of this.hitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        return true;
      }
    }
    return false;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
