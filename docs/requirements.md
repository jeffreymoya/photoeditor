photo editing app requirements
- user can upload one or more photos or use the camera on the phone
- app will optimize image/s size and dimension
- app will upload the image/s to aws
- lambda function will process the images
- it will send the image along with a prompt to analyze the image to gemini flash image (nano banana)
- it will receive the response then it will send the analysis and the image to seedream 4.0 for editing
- it will receive the edited image and save to a s3 bucket of the user
- the user will be notified that the image is done processing