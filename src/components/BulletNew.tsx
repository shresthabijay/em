import React, { RefObject } from 'react'
import { animated, useSpring } from 'react-spring'

// other bullets
// •◦◂◄◀︎ ➤▹▸►◥

const TEXT_SELECTION_OPCAITY = 0.3

interface BulletProps {
    expanded: boolean,
    isActive: boolean,
    isDragActive: boolean,
    hasChildren: boolean,
    hide: boolean,
    innerRef: RefObject<any>,
  }

/**
 * Bullet component with animation.
 */
const BulletNew = ({ expanded, isActive, isDragActive, hasChildren, hide, innerRef }: BulletProps) => {

  // spring animation for bullet
  const { rotation, selectionOpacity } = useSpring({
    rotation: expanded ? 90 : 0,
    selectionOpacity: isActive ? TEXT_SELECTION_OPCAITY : 0,
  })

  return (
    <animated.div
      ref={innerRef}
      style={{
        cursor: 'pointer',
        visibility: hide ? 'hidden' : 'visible',
        height: '0.86rem',
        width: '0.86rem',
        marginTop: '0.25rem',
        borderRadius: '50%',
        display: 'flex',
        marginRight: '0.4rem',
        justifyContent: 'center',
        alignItems: 'center',
        ...selectionOpacity ? {
          background: selectionOpacity.interpolate(
            o => isDragActive ? `rgb(255,192,203,${o})` : `rgba(255,255,255,${o})`
          ) } : {}
      }}
    >
      <animated.span
        style={{
          ...rotation ? { transform: rotation.interpolate(r => `rotate(${r}deg)`) } : {},
          fontSize: '0.94rem',
        }}
      >
        {hasChildren ? '▸' : '•'}
      </animated.span>
    </animated.div>
  )
}

export default BulletNew
