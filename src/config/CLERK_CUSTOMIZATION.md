# Clerk UI Customization Guide

This guide explains how to customize Clerk's authentication UI for both web and mobile platforms.

## 🎨 Quick Customization

### 1. Change Colors

Edit `src/config/clerkAppearance.ts`:

```typescript
// Web appearance
const webAppearance = {
  variables: {
    colorPrimary: '#your-brand-color', // Main brand color
    colorBackground: '#your-bg-color', // Background color
    colorText: '#your-text-color', // Text color
    colorSuccess: '#your-success-color', // Success messages
    colorDanger: '#your-error-color', // Error messages
  },
};
```

### 2. Change Fonts

```typescript
variables: {
  fontFamily: 'Your-Font, system-ui, sans-serif',
  fontSize: '16px',
  fontWeight: {
    normal: '400',
    semibold: '600',
    bold: '700',
  }
}
```

### 3. Change Spacing & Borders

```typescript
variables: {
  borderRadius: '12px',        // Rounded corners
  spacingUnit: '8px',          // General spacing
}
```

## 🎯 Platform-Specific Customization

### Web vs Mobile Differences

- **Web**: Uses `@clerk/clerk-react` with CSS-based styling
- **Mobile**: Uses `@clerk/clerk-expo` with React Native styling

### Current Platform Differences

- **Mobile**: Larger fonts, more spacing, touch-friendly buttons
- **Web**: Standard web fonts, hover effects, box shadows

## 🔧 Advanced Customization

### 1. Component-Level Styling

Customize specific Clerk components:

```typescript
elements: {
  // Customize the main card
  card: {
    borderRadius: '20px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
  },

  // Customize buttons
  formButtonPrimary: {
    backgroundColor: '#your-color',
    borderRadius: '8px',
    '&:hover': {
      backgroundColor: '#darker-color',
    },
  },

  // Customize input fields
  formFieldInput: {
    borderRadius: '8px',
    border: '2px solid #your-border-color',
    '&:focus': {
      borderColor: '#your-focus-color',
    },
  },
}
```

### 2. Using Pre-built Themes

Switch between different themes easily:

```typescript
// In ClerkProvider.tsx
import { getTheme } from '@/config/clerkThemes';

const appearance = getTheme('brand'); // or 'dark', 'minimal', 'light'
```

### 3. Custom Theme Creation

Create your own theme:

```typescript
export const myCustomTheme = {
  baseTheme: undefined,
  variables: {
    // Your custom variables
  },
  elements: {
    // Your custom element styles
  },
};
```

## 📱 Mobile-Specific Features

### Touch-Friendly Design

- Minimum 44px touch targets
- Larger fonts for readability
- More spacing between elements

### iOS vs Android

- Uses system fonts automatically
- Respects platform conventions
- Adapts to device settings

## 🌐 Web-Specific Features

### CSS Features

- Hover effects
- Box shadows
- CSS gradients
- Media queries support

### Responsive Design

- Adapts to different screen sizes
- Mobile-first approach
- Touch and mouse support

## 🚀 Quick Start Examples

### 1. Change Brand Colors

```typescript
// In clerkAppearance.ts
variables: {
  colorPrimary: '#FF6B6B',      // Coral red
  colorSuccess: '#4ECDC4',      // Teal
  colorDanger: '#FFE66D',       // Yellow
}
```

### 2. Add Custom Logo

```typescript
elements: {
  logoBox: {
    backgroundImage: 'url(/path/to/your/logo.png)',
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
  },
}
```

### 3. Dark Mode Support

```typescript
// Use the pre-built dark theme
import { darkTheme } from '@/config/clerkThemes';

// Or create your own
const myDarkTheme = {
  variables: {
    colorBackground: '#1a1a1a',
    colorText: '#ffffff',
    // ... other dark colors
  },
};
```

## 🔄 Future Updates

### Easy Theme Switching

```typescript
// Add theme switching logic
const [currentTheme, setCurrentTheme] = useState('light');

const appearance = getTheme(currentTheme as keyof typeof clerkThemes);
```

### Dynamic Theming

```typescript
// Theme based on user preference
const appearance = userPrefersDark ? darkTheme : lightTheme;
```

### A/B Testing

```typescript
// Different themes for different user groups
const appearance = userGroup === 'premium' ? brandTheme : minimalTheme;
```

## 📚 Resources

- [Clerk Appearance Documentation](https://clerk.com/docs/customization/overview)
- [CSS Variables Reference](https://clerk.com/docs/customization/overview#css-variables)
- [Element Customization](https://clerk.com/docs/customization/overview#element-customization)

## 🎨 Design System Integration

The current configuration uses your app's design system:

- Colors from `src/constants/colors.ts`
- Spacing from `src/constants/theme.ts`
- Font sizes and weights from your theme

This ensures consistency across your entire application!
