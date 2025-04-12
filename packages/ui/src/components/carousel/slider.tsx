import React, { ReactNode, useEffect, RefObject, useState } from 'react';
import { useKeenSlider } from 'keen-slider/react';

import 'keen-slider/keen-slider.min.css';
import './slider.css';

interface SliderProps {
	images: ReactNode[];
}

export default function Slider({ images }: SliderProps) {
	const [currentSlide, setCurrentSlide] = React.useState(0);
	const [loaded, setLoaded] = useState(false);

	const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
		initial: 0,
		slideChanged(slider) {
			setCurrentSlide(slider.track.details.rel);
		},
		created() {
			setLoaded(true);
		},
	});

	// Reinitialize slider on images update
	useEffect(() => {
		if (images.length > 0) {
			setTimeout(() => {
				instanceRef.current?.update();
			}, 100); // Small delay to ensure DOM is updated
		}
	}, [images, instanceRef]);

	return (
		<>
			<div className='navigation-wrapper min-h-[inherit]'>
				<div ref={sliderRef} className='keen-slider min-h-[inherit]'>
					{images.length > 0 && (
						<>
							{images.map((image, index) => (
								<div key={index} className='keen-slider__slide'>
									{image}
								</div>
							))}
						</>
					)}
				</div>
			</div>

			{loaded && instanceRef.current && (
				<div className='dots'>
					{[...Array(instanceRef.current.track.details.slides.length).keys()].map((idx) => {
						return (
							<button
								key={idx}
								onClick={() => {
									instanceRef.current?.moveToIdx(idx);
								}}
								className={'dot' + (currentSlide === idx ? ' active' : '')}></button>
						);
					})}
				</div>
			)}
		</>
	);
}

function Arrow(props: { disabled: boolean; left?: boolean; onClick: (e: any) => void }) {
	const disabled = props.disabled ? ' arrow--disabled' : '';
	return (
		<svg
			onClick={props.onClick}
			className={`arrow ${props.left ? 'arrow--left' : 'arrow--right'} ${disabled}`}
			xmlns='http://www.w3.org/2000/svg'
			viewBox='0 0 24 24'>
			{props.left && <path d='M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z' />}
			{!props.left && <path d='M5 3l3.057-3 11.943 12-11.943 12-3.057-3 9-9z' />}
		</svg>
	);
}
