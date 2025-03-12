import React, { RefObject } from 'react';
import { useKeenSlider, KeenSliderPlugin, KeenSliderInstance } from 'keen-slider/react';
import 'keen-slider/keen-slider.min.css';

import './slider.css';

interface SliderProps {
	images: string[];
	thumbnails: string[];
}

export default function Slider({ images, thumbnails }: SliderProps) {
	const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
		initial: 0,
	});
	const [thumbnailRef] = useKeenSlider<HTMLDivElement>(
		{
			initial: 0,
			slides: {
				perView: 4,
				spacing: 10,
			},
		},
		[ThumbnailPlugin(instanceRef)],
	);

	return (
		<>
			<div ref={sliderRef} className='keen-slider w-full'>
				{images.map((image, index) => (
					<div key={index} className='keen-slider__slide'>
						<img src={image} alt={`Slide ${index + 1}`} />
					</div>
				))}
			</div>

			<div ref={thumbnailRef} className='keen-slider thumbnail w-full'>
				{thumbnails.map((thumb, index) => (
					<div key={index} className='keen-slider__slide'>
						<img src={thumb} alt={`Thumbnail ${index + 1}`} />
					</div>
				))}
			</div>
		</>
	);
}

function ThumbnailPlugin(mainRef: RefObject<KeenSliderInstance | null>): KeenSliderPlugin {
	return (slider) => {
		function removeActive() {
			slider.slides.forEach((slide) => {
				slide.classList.remove('active');
			});
		}

		function addActive(idx: number) {
			if (slider.slides[idx]) {
				slider.slides[idx].classList.add('active');
			}
		}

		function addClickEvents() {
			slider.slides.forEach((slide, idx) => {
				slide.addEventListener('click', () => {
					if (mainRef.current) mainRef.current.moveToIdx(idx);
				});
			});
		}

		slider.on('created', () => {
			if (!mainRef.current) return;
			addActive(slider.track.details.rel);
			addClickEvents();
			mainRef.current.on('animationStarted', (main) => {
				removeActive();
				const next = main.animator.targetIdx || 0;
				addActive(main.track.absToRel(next));
				slider.moveToIdx(Math.min(slider.track.details.maxIdx, next));
			});
		});
	};
}
