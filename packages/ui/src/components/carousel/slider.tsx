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

			{loaded && images.length > 1 && instanceRef.current && (
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
